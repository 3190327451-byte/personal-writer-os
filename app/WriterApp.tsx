"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import {
  EditorContent,
  useEditor,
  type Editor,
  type JSONContent,
} from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Highlight from "@tiptap/extension-highlight";
import Placeholder from "@tiptap/extension-placeholder";
import { Color, FontSize, TextStyle } from "@tiptap/extension-text-style";
import { useLiveQuery } from "dexie-react-hooks";
import {
  db,
  exportBackup,
  importBackup,
  saveRollingSnapshot,
} from "./lib/db";
import {
  CATEGORY_META,
  EMPTY_DOCUMENT,
  type Material,
  type SideNote,
  type SessionMood,
  type SessionSegment,
  type Work,
  type WorkCategory,
  type WorkSnapshot,
  type WritingSession,
} from "./lib/types";
import {
  countWords,
  formatDateTime,
  formatDuration,
  localDateKey,
  nextMidnight,
  sessionDuration,
} from "./lib/utils";

type Navigate = (path: string) => void;

function useLocalRouter() {
  const subscribe = useCallback((onChange: () => void) => {
    window.addEventListener("popstate", onChange);
    return () => window.removeEventListener("popstate", onChange);
  }, []);
  const path = useSyncExternalStore(
    subscribe,
    () => window.location.pathname,
    () => "/",
  );

  const navigate = useCallback((nextPath: string) => {
    window.history.pushState({}, "", nextPath);
    window.dispatchEvent(new PopStateEvent("popstate"));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  return { path, navigate };
}

function registerPwa() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker
      .register("/sw.js", { updateViaCache: "none" })
      .then((registration) => registration.update())
      .catch(() => undefined);
  }
  if (navigator.storage?.persist) {
    navigator.storage.persist().catch(() => undefined);
  }
}

function DismissibleDetails({
  className,
  summary,
  summaryAriaLabel,
  children,
}: {
  className: string;
  summary: ReactNode;
  summaryAriaLabel?: string;
  children: ReactNode;
}) {
  const detailsRef = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const dismissOnOutsidePress = (event: PointerEvent) => {
      const details = detailsRef.current;
      if (
        details?.open &&
        event.target instanceof Node &&
        !details.contains(event.target)
      ) {
        details.open = false;
      }
    };
    const dismissOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && detailsRef.current?.open) {
        detailsRef.current.open = false;
      }
    };
    document.addEventListener("pointerdown", dismissOnOutsidePress);
    document.addEventListener("keydown", dismissOnEscape);
    return () => {
      document.removeEventListener("pointerdown", dismissOnOutsidePress);
      document.removeEventListener("keydown", dismissOnEscape);
    };
  }, []);

  return (
    <details ref={detailsRef} className={className}>
      <summary aria-label={summaryAriaLabel}>{summary}</summary>
      {children}
    </details>
  );
}

function parseTags(value: string) {
  return Array.from(
    new Set(
      value
        .split(/[,，#\n]/)
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ).slice(0, 12);
}

function documentLinks(content: JSONContent): string[] {
  const links = new Set<string>();
  const visit = (node: JSONContent) => {
    node.marks?.forEach((mark) => {
      if (
        mark.type === "link" &&
        typeof mark.attrs?.href === "string" &&
        /^https?:\/\//i.test(mark.attrs.href)
      ) {
        links.add(mark.attrs.href);
      }
    });
    node.content?.forEach(visit);
  };
  visit(content);
  return [...links];
}

function materialTitle(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function nowMs() {
  return Date.now();
}

async function syncLinkedMaterials(content: JSONContent, workId: string) {
  const links = documentLinks(content);
  const now = Date.now();
  const activeMaterialIds = new Set<string>();
  for (const url of links) {
    let material = await db.materials.where("url").equals(url).first();
    if (!material) {
      material = {
        id: crypto.randomUUID(),
        title: materialTitle(url),
        url,
        note: "",
        tags: [],
        source: "reference",
        createdAt: now,
        updatedAt: now,
      };
      await db.materials.add(material);
    }
    activeMaterialIds.add(material.id);
    await db.materialReferences.put({
      id: `${workId}::${material.id}`,
      materialId: material.id,
      workId,
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
    });
  }
  const previous = await db.materialReferences.where("workId").equals(workId).toArray();
  const stale = previous.filter(
    (reference) => reference.deletedAt === null && !activeMaterialIds.has(reference.materialId),
  );
  if (stale.length) {
    await db.materialReferences.bulkDelete(stale.map((reference) => reference.id));
  }
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function documentToHtml(content: JSONContent): string {
  const render = (node: JSONContent): string => {
    const children = node.content?.map(render).join("") ?? "";
    if (node.type === "text") {
      let text = escapeHtml(node.text ?? "");
      for (const mark of node.marks ?? []) {
        if (mark.type === "bold") text = `<strong>${text}</strong>`;
        if (mark.type === "italic") text = `<em>${text}</em>`;
        if (mark.type === "link") {
          text = `<a href="${escapeHtml(String(mark.attrs?.href ?? ""))}">${text}</a>`;
        }
        if (mark.type === "highlight") {
          text = `<mark style="background:${escapeHtml(String(mark.attrs?.color ?? "#fff1a8"))}">${text}</mark>`;
        }
      }
      return text;
    }
    if (node.type === "paragraph") return `<p>${children || "<br>"}</p>`;
    if (node.type === "heading") return `<h${node.attrs?.level ?? 2}>${children}</h${node.attrs?.level ?? 2}>`;
    if (node.type === "bulletList") return `<ul>${children}</ul>`;
    if (node.type === "orderedList") return `<ol>${children}</ol>`;
    if (node.type === "listItem") return `<li>${children}</li>`;
    if (node.type === "hardBreak") return "<br>";
    return children;
  };
  return render(content);
}

function safeFileName(value: string) {
  return (value.trim() || "Untitled work").replace(/[\\/:*?"<>|]/g, "-").slice(0, 80);
}

function sideNotesAppendix(notes: SideNote[]) {
  if (!notes.length) return "";
  return `<section class="side-notes-appendix"><h2>Side Notes</h2>${notes
    .map((note) => `<article><h3>${note.important ? "★ " : ""}${escapeHtml(note.title || "Untitled Side Note")}</h3>${note.contentHtml}</article>`)
    .join("")}</section>`;
}

function workDocumentHtml(work: Work, themed: boolean, notes: SideNote[] = []) {
  const categoryClass = themed ? ` theme-${work.category}` : "";
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(work.title)}</title>
  <style>
  @page{margin:22mm}body{margin:0;color:#29242d;font:17px/1.8 Georgia,"Times New Roman",serif}
  main{max-width:760px;margin:auto}h1{font:700 30px/1.2 Arial,sans-serif;border-bottom:1px solid #999;padding-bottom:12px}
  p{margin:0 0 1em}a{color:#2b61a7}mark{padding:0 2px}.side-notes-appendix{break-before:page;margin-top:50px;border-top:2px solid #888}.side-notes-appendix article{margin:22px 0;padding:12px;border:1px solid #bbb}
  body[class]{padding:24px;background:#fff}body.theme-social-insight main{border-top:10px solid #2779d5;padding:24px;background:#edf9ff}
  body.theme-life-essay main{padding:24px 30px;background:repeating-linear-gradient(#fff3bd 0 31px,#d7b478 32px);line-height:32px}
  body.theme-review main{border-inline:14px solid #362440;padding:24px 36px;background:#faf2e7}
  body.theme-fan-fiction main{border:5px double #d93c91;padding:28px;background:#fff0fb}
  </style></head><body class="${categoryClass.trim()}"><main><h1>${escapeHtml(work.title || "Untitled work")}</h1>${documentToHtml(work.contentJSON)}${sideNotesAppendix(notes)}</main></body></html>`;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportWord(work: Work, notes: SideNote[] = []) {
  downloadBlob(
    new Blob([workDocumentHtml(work, false, notes)], { type: "application/msword;charset=utf-8" }),
    `${safeFileName(work.title)}.doc`,
  );
}

function exportPdf(work: Work, themed: boolean, notes: SideNote[] = []) {
  const popup = window.open("", "_blank");
  if (!popup) return;
  popup.document.open();
  popup.document.write(workDocumentHtml(work, themed, notes));
  popup.document.close();
  popup.addEventListener("load", () => popup.print(), { once: true });
}

async function permanentlyDeleteWork(work: Work) {
  const deletedAt = Date.now();
  const links = documentLinks(work.contentJSON);
  await db.transaction(
    "rw",
    [db.works, db.snapshots, db.recoveryDrafts, db.sideNotes, db.deletedWorks, db.materials, db.materialReferences],
    async () => {
      for (const url of links) {
        const material = await db.materials.where("url").equals(url).first();
        if (material) {
          const id = `${work.id}::${material.id}`;
          const current = await db.materialReferences.get(id);
          await db.materialReferences.put({
            id,
            materialId: material.id,
            workId: work.id,
            deletedAt,
            createdAt: current?.createdAt ?? deletedAt,
            updatedAt: deletedAt,
          });
        }
      }
      await db.deletedWorks.put({ id: work.id, deletedAt });
      await db.snapshots.where("workId").equals(work.id).delete();
      await db.recoveryDrafts.delete(work.id);
      await db.sideNotes.where("workId").equals(work.id).delete();
      await db.works.delete(work.id);
    },
  );
}

function useRetroSound() {
  const enabled =
    useLiveQuery(() => db.settings.get("retro-sound"), [], undefined)?.value ===
    true;
  return useCallback(
    (kind: "open" | "save" | "complete") => {
      if (!enabled) return;
      const AudioContextClass =
        window.AudioContext ||
        (window as typeof window & { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!AudioContextClass) return;
      const context = new AudioContextClass();
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const frequencies = { open: 520, save: 660, complete: 780 };
      oscillator.type = "sine";
      oscillator.frequency.value = frequencies[kind];
      gain.gain.setValueAtTime(0.035, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(
        0.0001,
        context.currentTime + 0.12,
      );
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + 0.12);
      oscillator.addEventListener("ended", () => context.close());
    },
    [enabled],
  );
}

export default function WriterApp() {
  const { path, navigate } = useLocalRouter();

  useEffect(() => {
    registerPwa();
  }, []);

  const route = useMemo(() => {
    const settlement = path.match(
      /^\/write\/([^/]+)\/settlement\/([^/]+)\/?$/,
    );
    if (settlement) {
      return {
        name: "settlement" as const,
        workId: settlement[1],
        sessionId: settlement[2],
      };
    }
    const editor = path.match(/^\/write\/([^/]+)\/?$/);
    if (editor && editor[1] !== "new") {
      return { name: "editor" as const, workId: editor[1] };
    }
    if (path === "/write/new") return { name: "new" as const };
    if (path === "/writing" || path === "/write" || path === "/works") {
      return { name: "writing" as const };
    }
    if (path === "/dashboard") return { name: "dashboard" as const };
    if (path === "/materials") return { name: "materials" as const };
    return { name: "home" as const };
  }, [path]);

  const isEditor = route.name === "editor";

  return (
    <div className={isEditor ? "app-shell app-shell--editor" : "app-shell"}>
      <Header path={path} navigate={navigate} compact={isEditor} />
      {!isEditor && <DesktopChrome path={path} navigate={navigate} />}
      <main className={isEditor ? "main main--editor" : "main"}>
        {route.name === "home" && <HomePage navigate={navigate} />}
        {route.name === "new" && <NewWorkPage navigate={navigate} />}
        {route.name === "writing" && <WorksPage navigate={navigate} />}
        {route.name === "editor" && (
          <EditorPage workId={route.workId} navigate={navigate} />
        )}
        {route.name === "settlement" && (
          <SettlementPage
            workId={route.workId}
            sessionId={route.sessionId}
            navigate={navigate}
          />
        )}
        {route.name === "dashboard" && <DashboardPage navigate={navigate} />}
        {route.name === "materials" && <MaterialsPage navigate={navigate} />}
      </main>
      {!isEditor && route.name !== "settlement" && (
        <WritingReminder navigate={navigate} />
      )}
    </div>
  );
}

function DesktopChrome({ path, navigate }: { path: string; navigate: Navigate }) {
  const shortcuts = [
    { label: "New draft", glyph: "W", href: "/write/new" },
    { label: "Writing", glyph: "#", href: "/writing" },
    { label: "Overview", glyph: "+", href: "/dashboard" },
    { label: "Materials", glyph: "@", href: "/materials" },
  ];

  return (
    <>
      <aside className="desktop-shortcuts" aria-label="Desktop shortcuts">
        {shortcuts.map((item) => (
          <button key={item.href} onClick={() => navigate(item.href)}>
            <span aria-hidden="true">{item.glyph}</span>
            <small>{item.label}</small>
          </button>
        ))}
      </aside>
      <div className="desktop-taskbar" aria-hidden="true">
        <span className="desktop-start">START</span>
        <span className="desktop-task">▣ Personal Writer OS</span>
        <span className="desktop-status">LOCAL · {path === "/" ? "HOME" : path.slice(1).toUpperCase()}</span>
      </div>
    </>
  );
}

function Header({
  path,
  navigate,
  compact,
}: {
  path: string;
  navigate: Navigate;
  compact: boolean;
}) {
  const navItems = [
    { label: "Home", href: "/" },
    { label: "Writing", href: "/writing" },
    { label: "Overview", href: "/dashboard" },
    { label: "Materials", href: "/materials" },
  ];

  return (
    <header className={compact ? "header header--compact" : "header"}>
      <button
        className="brand"
        onClick={() => navigate("/")}
        aria-label="Return home"
      >
        <span className="brand-mark" aria-hidden="true">
          P
        </span>
        <span>
          <strong>Personal Writer OS</strong>
          <small>quiet writing · lasting growth</small>
        </span>
      </button>
      {!compact && (
        <nav className="top-nav" aria-label="Main navigation">
          {navItems.map((item) => {
            const active =
              item.href === "/"
                ? path === "/"
                : item.href === "/writing"
                  ? path === "/writing" || path === "/write" || path === "/works" || path.startsWith("/write/")
                : path === item.href || path.startsWith(`${item.href}/`);
            return (
              <button
                key={item.href}
                className={active ? "nav-link is-active" : "nav-link"}
                onClick={() => navigate(item.href)}
              >
                {item.label}
              </button>
            );
          })}
        </nav>
      )}
      <DataMenu />
    </header>
  );
}

function DataMenu() {
  const [message, setMessage] = useState("");
  const soundSetting = useLiveQuery(
    () => db.settings.get("retro-sound"),
    [],
  );
  const reminderSetting = useLiveQuery(
    () => db.settings.get("in-app-reminders"),
    [],
  );
  const soundEnabled = soundSetting?.value === true;
  const remindersEnabled = reminderSetting?.value !== false;

  const handleExport = async () => {
    const backup = await exportBackup();
    const blob = new Blob([JSON.stringify(backup, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `personal-writer-os-${localDateKey()}.writeros`;
    anchor.click();
    URL.revokeObjectURL(url);
    setMessage("Backup exported");
  };

  const handleImport = async (file: File | undefined) => {
    if (!file) return;
    const approved = window.confirm(
      "Newer records in this backup will be merged into this device. Continue?",
    );
    if (!approved) return;
    try {
      await importBackup(JSON.parse(await file.text()));
      setMessage("Backup imported");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Import failed");
    }
  };

  return (
    <DismissibleDetails
      className="data-menu"
      summary="Local data"
      summaryAriaLabel="Local data and preferences"
    >
      <div className="data-popover">
        <div className="popover-titlebar">
          <span>personal_writer.cfg</span>
          <i aria-hidden="true">×</i>
        </div>
        <p>Your writing stays on this device. Export a backup from time to time.</p>
        <button onClick={handleExport}>Export .writeros backup</button>
        <label className="file-button">
          Import a backup
          <input
            type="file"
            accept="application/json,.writeros,.json"
            onChange={(event) => handleImport(event.target.files?.[0])}
          />
        </label>
        <label className="sound-toggle">
          <input
            type="checkbox"
            checked={soundEnabled}
            onChange={async (event) => {
              const enabled = event.target.checked;
              await db.settings.put({
                key: "retro-sound",
                value: enabled,
                updatedAt: Date.now(),
              });
              setMessage(enabled ? "System sounds on" : "System sounds off");
            }}
          />
          <span>Retro system sounds</span>
          <small>{soundEnabled ? "ON" : "OFF"}</small>
        </label>
        <label className="sound-toggle">
          <input
            type="checkbox"
            checked={remindersEnabled}
            onChange={async (event) => {
              const enabled = event.target.checked;
              await db.settings.put({
                key: "in-app-reminders",
                value: enabled,
                updatedAt: Date.now(),
              });
              setMessage(enabled ? "In-app reminders on" : "In-app reminders off");
            }}
          />
          <span>In-app reminders</span>
          <small>{remindersEnabled ? "ON" : "OFF"}</small>
        </label>
        <button
          type="button"
          onClick={() =>
            window.dispatchEvent(new CustomEvent("preview-writing-reminder"))
          }
        >
          Preview reminder
        </button>
        {message && <small role="status">{message}</small>}
      </div>
    </DismissibleDetails>
  );
}

function WritingReminder({ navigate }: { navigate: Navigate }) {
  const works = useLiveQuery(
    () => db.works.filter((work) => work.deletedAt === null).toArray(),
    [],
    [],
  );
  const sessions = useLiveQuery(() => db.sessions.toArray(), [], []);
  const reminderSetting = useLiveQuery(
    () => db.settings.get("in-app-reminders"),
    [],
  );
  const dismissedSetting = useLiveQuery(
    () => db.settings.get("reminder-dismissed-date"),
    [],
  );
  const [clock, setClock] = useState(() => Date.now());
  const [previewVisible, setPreviewVisible] = useState(false);

  useEffect(() => {
    const interval = window.setInterval(() => setClock(Date.now()), 60_000);
    const preview = () => setPreviewVisible(true);
    window.addEventListener("preview-writing-reminder", preview);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("preview-writing-reminder", preview);
    };
  }, []);

  const now = new Date(clock);
  const today = localDateKey(clock);
  const weekend = now.getDay() === 0 || now.getDay() === 6;
  const reminderHour = weekend ? 11 : 9;
  const alreadyWrote = sessions.some(
    (session) => localDateKey(session.startedAt) === today,
  );
  const dismissedToday = dismissedSetting?.value === today;
  const visible =
    previewVisible ||
    (reminderSetting?.value !== false &&
      now.getHours() >= reminderHour &&
      !alreadyWrote &&
      !dismissedToday);

  if (!visible) return null;

  const dismiss = async () => {
    if (previewVisible) {
      setPreviewVisible(false);
      return;
    }
    const today = localDateKey();
    await db.settings.put({
      key: "reminder-dismissed-date",
      value: today,
      updatedAt: Date.now(),
    });
  };

  const openWriting = async () => {
    const active = sessions
      .filter((session) => session.state !== "ended")
      .sort((a, b) => b.startedAt - a.startedAt)[0];
    const recent = [...works].sort((a, b) => b.updatedAt - a.updatedAt)[0];
    await dismiss();
    navigate(active ? `/write/${active.workId}` : recent ? `/write/${recent.id}` : "/write/new");
  };

  return (
    <div className="system-dialog-layer">
      <section
        className="reminder-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="reminder-title"
      >
        <div className="dialog-titlebar">
          <span>reminder.msg</span>
          <button onClick={dismiss} aria-label="Close reminder">×</button>
        </div>
        <div className="reminder-body">
          <span className="reminder-icon" aria-hidden="true">✎</span>
          <div>
            <h2 id="reminder-title">Your writing desk has not been opened today.</h2>
            <div className="dialog-actions">
              <button className="button button--primary" onClick={openWriting}>
                Open writing desk
              </button>
              <button className="button button--secondary" onClick={dismiss}>
                Not now
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function HomePage({ navigate }: { navigate: Navigate }) {
  const works = useLiveQuery(
    () => db.works.filter((work) => work.deletedAt === null).toArray(),
    [],
    [],
  );
  const sessions = useLiveQuery(() => db.sessions.toArray(), [], []);
  const recentWorks = [...works]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 3);
  const todaySessions = sessions.filter(
    (session) =>
      session.state === "ended" &&
      localDateKey(session.startedAt) === localDateKey(),
  );
  const todayDuration = todaySessions.reduce(
    (sum, session) => sum + session.durationMs,
    0,
  );
  const activeSession = sessions
    .filter((session) => session.state !== "ended")
    .sort((a, b) => b.startedAt - a.startedAt)[0];
  const continueWork =
    works.find((work) => work.id === activeSession?.workId) ?? recentWorks[0];

  return (
    <section className="home-page">
      <div className="welcome-block">
        <p className="eyebrow">{todayGreeting()}</p>
        <h1>
          <span>write something.</span>
          <small>give your inspiration a place to stay.</small>
        </h1>
        <div className="home-actions">
          <button
            className="button button--primary"
            onClick={() =>
              navigate(continueWork ? `/write/${continueWork.id}` : "/writing")
            }
          >
            Continue writing
          </button>
          <button
            className="button button--secondary"
            onClick={() => navigate("/write/new")}
          >
            New work
          </button>
        </div>
      </div>

      <aside className="today-card">
        <div className="window-titlebar">
          <span>today.log</span>
          <i aria-hidden="true">_ □ ×</i>
        </div>
        <span>Writing today</span>
        {todayDuration > 0 ? (
          <>
            <strong>{Math.max(1, Math.round(todayDuration / 60000))} min</strong>
            <small>{todaySessions.length} quiet session{todaySessions.length === 1 ? "" : "s"}</small>
          </>
        ) : (
          <small className="quiet-status">No writing yet today</small>
        )}
      </aside>

      <div className="recent-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Recently edited</p>
          </div>
          <button className="text-button" onClick={() => navigate("/writing")}>
            Open writing
          </button>
        </div>
        {recentWorks.length ? (
          <div className="work-grid">
            {recentWorks.map((work) => (
              <WorkCard key={work.id} work={work} navigate={navigate} />
            ))}
          </div>
        ) : (
          <EmptyWorks navigate={navigate} />
        )}
      </div>
    </section>
  );
}

function todayGreeting() {
  const hour = new Date().getHours();
  if (hour < 6) return "late night session";
  if (hour < 12) return "good morning";
  if (hour < 18) return "good afternoon";
  return "good evening";
}

function WorksPage({ navigate }: { navigate: Navigate }) {
  const works = useLiveQuery(
    () => db.works.filter((work) => work.deletedAt === null).toArray(),
    [],
    [],
  );
  const [sort, setSort] = useState<"updated" | "created" | "words">("updated");
  const [category, setCategory] = useState<WorkCategory>("social-insight");
  const [tag, setTag] = useState("");
  const [query, setQuery] = useState("");
  const [searchScope, setSearchScope] = useState<"all" | WorkCategory>("all");
  const sorted = [...works].sort((a, b) => {
    if (sort === "created") return b.createdAt - a.createdAt;
    if (sort === "words") return b.wordCount - a.wordCount;
    return b.updatedAt - a.updatedAt;
  });
  const categoryWorks = sorted.filter((work) => work.category === category);
  const categoryTags = Array.from(
    new Set(categoryWorks.flatMap((work) => work.tags ?? [])),
  ).sort((a, b) => a.localeCompare(b));
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const matchesQuery = (work: Work) =>
      work.title.toLocaleLowerCase().includes(normalizedQuery) ||
      work.plainText.toLocaleLowerCase().includes(normalizedQuery) ||
      (work.tags ?? []).some((item) =>
        item.toLocaleLowerCase().includes(normalizedQuery),
      );
  const visibleWorks = categoryWorks.filter(
    (work) => !tag || (work.tags ?? []).includes(tag),
  );
  const searchResults = normalizedQuery
    ? sorted.filter(
        (work) =>
          (searchScope === "all" || work.category === searchScope) &&
          matchesQuery(work),
      )
    : [];
  const searchGroups = (Object.keys(CATEGORY_META) as WorkCategory[])
    .map((item) => ({
      category: item,
      works: searchResults.filter((work) => work.category === item),
    }))
    .filter((group) => group.works.length);

  return (
    <section className="content-page">
      <div className="page-heading page-heading--row">
        <div>
          <p className="eyebrow">Personal Writer OS</p>
          <h1>writing</h1>
        </div>
        <button
          className="button button--primary"
          onClick={() => navigate("/write/new")}
        >
          New work
        </button>
      </div>
      <div className="category-switcher" role="tablist" aria-label="Writing types">
        {(Object.keys(CATEGORY_META) as WorkCategory[]).map((item) => (
          <button
            key={item}
            role="tab"
            aria-selected={normalizedQuery ? searchScope === item : category === item}
            className={`category-tab theme-${item}${(normalizedQuery ? searchScope === item : category === item) ? " is-active" : ""}`}
            onClick={() => {
              setCategory(item);
              setTag("");
              if (normalizedQuery) setSearchScope(item);
            }}
          >
            <span>{CATEGORY_META[item].shortName}</span>
            <strong>{CATEGORY_META[item].name}</strong>
            <small>{works.filter((work) => work.category === item).length}</small>
          </button>
        ))}
      </div>
      <div className="library-toolbar">
        <label className="library-search">
          <span className="sr-only">Search works</span>
          <input
            value={query}
            onChange={(event) => {
              const nextQuery = event.target.value;
              if (!query.trim() && nextQuery.trim()) setSearchScope("all");
              setQuery(nextQuery);
            }}
            placeholder="Search title, text, or tag…"
          />
          {query && (
            <button
              type="button"
              className="library-search-clear"
              aria-label="Clear search"
              onClick={() => {
                setQuery("");
                setSearchScope("all");
              }}
            >
              ×
            </button>
          )}
        </label>
        <label>
          Sort
          <select
            value={sort}
            onChange={(event) =>
              setSort(event.target.value as "updated" | "created" | "words")
            }
          >
            <option value="updated">Recently edited</option>
            <option value="created">Date created</option>
            <option value="words">Word count</option>
          </select>
        </label>
      </div>
      {normalizedQuery && (
        <div className="search-summary" role="status">
          <span>
            {searchResults.length} matching {searchResults.length === 1 ? "work" : "works"}
            {searchScope !== "all" ? ` in ${CATEGORY_META[searchScope].name}` : " across all writing types"}
          </span>
          {searchScope !== "all" && (
            <button type="button" onClick={() => setSearchScope("all")}>
              Search all types
            </button>
          )}
        </div>
      )}
      {!normalizedQuery && <div className="tag-filter">
        <button className={!tag ? "is-active" : ""} onClick={() => setTag("")}>
          all
        </button>
        {categoryTags.map((item) => (
          <button
            key={item}
            className={tag === item ? "is-active" : ""}
            onClick={() => setTag(item)}
          >
            #{item}
          </button>
        ))}
        {!categoryTags.length && <span>No tags in this writing type yet.</span>}
      </div>}
      {normalizedQuery ? (
        searchGroups.length ? (
          <div className="search-result-groups">
            {searchGroups.map((group) => (
              <div className="category-groups" key={group.category}>
                <div className="category-title">
                  <span className={`category-dot theme-${group.category}`} />
                  <h2>{CATEGORY_META[group.category].name}</h2>
                  <small>{group.works.length}</small>
                </div>
                <div className="work-grid">
                  {group.works.map((work) => (
                    <WorkCard key={work.id} work={work} navigate={navigate} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-filter">No matching works.</div>
        )
      ) : visibleWorks.length ? (
        <div className="category-groups">
          <div className="category-title">
            <span className={`category-dot theme-${category}`} />
            <h2>{CATEGORY_META[category].name}</h2>
            <small>{visibleWorks.length}</small>
          </div>
          <div className="work-grid">
            {visibleWorks.map((work) => (
              <WorkCard key={work.id} work={work} navigate={navigate} />
            ))}
          </div>
        </div>
      ) : (
        <div className="empty-filter">Nothing here yet.</div>
      )}
    </section>
  );
}

function WorkCard({ work, navigate }: { work: Work; navigate: Navigate }) {
  const [dialog, setDialog] = useState<"delete" | "export" | null>(null);
  const [includeSideNotes, setIncludeSideNotes] = useState(false);
  const sideNotes = useLiveQuery(
    () => db.sideNotes.where("workId").equals(work.id).toArray(),
    [work.id],
    [],
  );
  const activeSession = useLiveQuery(
    () =>
      db.sessions
        .where("workId")
        .equals(work.id)
        .filter((session) => session.state !== "ended")
        .first(),
    [work.id],
  );
  const [deleting, setDeleting] = useState(false);

  const confirmDelete = async () => {
    if (deleting || activeSession) return;
    setDeleting(true);
    await permanentlyDeleteWork(work);
    setDialog(null);
  };

  return (
    <>
      <article className={`work-card theme-${work.category}`}>
        <button
          className="work-card-open"
          onClick={() => navigate(`/write/${work.id}`)}
        >
          <span className="work-card-category">
            {CATEGORY_META[work.category].name}
          </span>
          <strong>{work.title || "Untitled work"}</strong>
          <p>{work.plainText.slice(0, 72) || "Empty document"}</p>
          {!!work.tags?.length && (
            <span className="work-card-tags">
              {work.tags.slice(0, 3).map((item) => `#${item}`).join("  ")}
            </span>
          )}
          <span className="work-card-meta">
            {work.wordCount} words · {formatDateTime(work.updatedAt)}
          </span>
        </button>
        <DismissibleDetails
          className="work-card-menu"
          summary="⋯"
          summaryAriaLabel={`Actions for ${work.title || "Untitled work"}`}
        >
          <div>
            <button onClick={() => navigate(`/write/${work.id}`)}>Open</button>
            <button onClick={() => setDialog("export")}>Export</button>
            <button className="is-danger" onClick={() => setDialog("delete")}>Delete</button>
          </div>
        </DismissibleDetails>
      </article>
      {dialog && (
        <div className="system-dialog-layer">
          <section className="work-action-dialog" role="dialog" aria-modal="true">
            <div className="dialog-titlebar">
              <span>{dialog === "delete" ? "delete_work.msg" : "export_work.exe"}</span>
              <button onClick={() => setDialog(null)} aria-label="Close">×</button>
            </div>
            {dialog === "delete" ? (
              activeSession ? (
                <>
                  <h2>End the writing session first</h2>
                  <p>This work has a running or paused session. Open it, finish the session summary, then delete it.</p>
                  <div className="dialog-actions">
                    <button className="button button--primary" onClick={() => navigate(`/write/${work.id}`)}>
                      Open active session
                    </button>
                    <button className="button button--secondary" onClick={() => setDialog(null)}>Cancel</button>
                  </div>
                </>
              ) : (
                <>
                  <h2>Delete this work permanently?</h2>
                  <p>“{work.title || "Untitled work"}” and its Side Notes cannot be restored. Writing history will remain in Overview.</p>
                  <div className="dialog-actions">
                    <button className="button button--danger" disabled={deleting} onClick={confirmDelete}>
                      {deleting ? "Deleting…" : "Delete permanently"}
                    </button>
                    <button className="button button--secondary" onClick={() => setDialog(null)}>Cancel</button>
                  </div>
                </>
              )
            ) : (
              <>
                <h2>Export “{work.title || "Untitled work"}”</h2>
                <p>Word stays clean and editable. PDF can be clean or keep this writing type’s visual theme.</p>
                {!!sideNotes.length && (
                  <label className="export-side-notes">
                    <input
                      type="checkbox"
                      checked={includeSideNotes}
                      onChange={(event) => setIncludeSideNotes(event.target.checked)}
                    />
                    Append {sideNotes.length} Side Note{sideNotes.length === 1 ? "" : "s"}
                  </label>
                )}
                <div className="export-options">
                  <button className="button button--secondary" onClick={() => exportWord(work, includeSideNotes ? sideNotes : [])}>Word (.doc)</button>
                  <button className="button button--secondary" onClick={() => exportPdf(work, false, includeSideNotes ? sideNotes : [])}>Clean PDF</button>
                  <button className="button button--primary" onClick={() => exportPdf(work, true, includeSideNotes ? sideNotes : [])}>Themed PDF</button>
                </div>
              </>
            )}
          </section>
        </div>
      )}
    </>
  );
}

function EmptyWorks({ navigate }: { navigate: Navigate }) {
  return (
    <div className="empty-works">
      <span aria-hidden="true">✦</span>
      <h3>No works yet</h3>
      <button
        className="button button--secondary"
        onClick={() => navigate("/write/new")}
      >
        Create your first work
      </button>
    </div>
  );
}

function NewWorkPage({ navigate }: { navigate: Navigate }) {
  const [title, setTitle] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [category, setCategory] =
    useState<WorkCategory>("social-insight");
  const [creating, setCreating] = useState(false);

  const createWork = async () => {
    if (creating) return;
    setCreating(true);
    const now = Date.now();
    const id = crypto.randomUUID();
    await db.works.add({
      id,
      title: title.trim() || "Untitled work",
      category,
      tags: parseTags(tagsInput),
      contentJSON: EMPTY_DOCUMENT,
      plainText: "",
      wordCount: 0,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });
    navigate(`/write/${id}`);
  };

  return (
    <section className="new-work-page">
      <button className="back-button" onClick={() => navigate("/writing")}>
        ← writing
      </button>
      <div className="new-work-panel">
        <p className="eyebrow">new_document.exe</p>
        <h1>Create a work</h1>
        <label className="field">
          <span>Title</span>
          <input
            autoFocus
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Untitled is fine"
            onKeyDown={(event) => {
              if (event.key === "Enter") createWork();
            }}
          />
        </label>
        <label className="field field--tags">
          <span>Tags · separated by commas</span>
          <input
            value={tagsInput}
            onChange={(event) => setTagsInput(event.target.value)}
            placeholder="memory, city, artificial intelligence"
          />
        </label>
        <fieldset className="category-picker">
          <legend>Writing type</legend>
          <div className="category-options">
            {(Object.keys(CATEGORY_META) as WorkCategory[]).map((item) => (
              <label
                key={item}
                className={
                  category === item
                    ? `category-option theme-${item} is-selected`
                    : `category-option theme-${item}`
                }
              >
                <input
                  type="radio"
                  name="category"
                  value={item}
                  checked={category === item}
                  onChange={() => setCategory(item)}
                />
                <strong>{CATEGORY_META[item].name}</strong>
                <small>{CATEGORY_META[item].description}</small>
              </label>
            ))}
          </div>
        </fieldset>
        <button
          className="button button--primary button--wide"
          onClick={createWork}
          disabled={creating}
        >
          {creating ? "Opening a new window…" : "Create and open"}
        </button>
      </div>
    </section>
  );
}

function EditorPage({
  workId,
  navigate,
}: {
  workId: string;
  navigate: Navigate;
}) {
  const [work, setWork] = useState<Work | null | undefined>(undefined);
  const [recovered, setRecovered] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      const storedWork = await db.works.get(workId);
      if (!active) return;
      if (!storedWork || storedWork.deletedAt !== null) {
        setWork(null);
        return;
      }
      const draft = await db.recoveryDrafts.get(workId);
      if (draft && draft.savedAt > storedWork.updatedAt) {
        setWork({
          ...storedWork,
          title: draft.title,
          contentJSON: draft.contentJSON,
          plainText: draft.plainText,
          wordCount: draft.wordCount,
        });
        setRecovered(true);
      } else {
        setWork(storedWork);
      }
    })();
    return () => {
      active = false;
    };
  }, [workId]);

  if (work === undefined) {
    return <div className="loading-state">Opening work…</div>;
  }
  if (work === null) {
    return (
      <ComingSoon
        eyebrow="file_not_found"
        title="This work is missing"
        description="It may have been deleted, or it may only exist on another device."
      />
    );
  }

  return (
    <WritingWorkspace
      key={work.id}
      initialWork={work}
      recovered={recovered}
      navigate={navigate}
    />
  );
}

function WritingWorkspace({
  initialWork,
  recovered,
  navigate,
}: {
  initialWork: Work;
  recovered: boolean;
  navigate: Navigate;
}) {
  const [title, setTitle] = useState(initialWork.title);
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "dirty">(
    recovered ? "dirty" : "saved",
  );
  const [wordCount, setWordCount] = useState(initialWork.wordCount);
  const [recoveryNotice, setRecoveryNotice] = useState(recovered);
  const [typingSignal, setTypingSignal] = useState(0);
  const [tags, setTags] = useState(initialWork.tags ?? []);
  const [tagDraft, setTagDraft] = useState("");
  const [settlementSession, setSettlementSession] =
    useState<WritingSession | null>(null);
  const latestRef = useRef({
    title: initialWork.title,
    contentJSON: initialWork.contentJSON,
    plainText: initialWork.plainText,
    wordCount: initialWork.wordCount,
  });
  const dirtyRef = useRef(recovered);
  const draftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closedSnapshotRef = useRef(false);
  const autoStartWordCountRef = useRef(initialWork.wordCount);
  const autoStartArmedRef = useRef(true);
  const noteTyping = useCallback(() => {
    if (autoStartArmedRef.current) {
      autoStartWordCountRef.current = latestRef.current.wordCount;
      autoStartArmedRef.current = false;
    }
    setTypingSignal((signal) => signal + 1);
  }, []);
  const handleSessionEnd = useCallback((session: WritingSession) => {
    autoStartArmedRef.current = true;
    setSettlementSession(session);
  }, []);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ link: false }),
      TextStyle,
      FontSize,
      Color,
      Link.configure({
        openOnClick: false,
        autolink: true,
        defaultProtocol: "https",
        protocols: ["http", "https", "mailto"],
      }),
      Highlight.configure({ multicolor: true }),
      Placeholder.configure({
        placeholder: "Start writing…",
      }),
    ],
    content: initialWork.contentJSON,
    editorProps: {
      attributes: {
        class: "prose-editor",
        spellcheck: "true",
        "aria-label": "Work text",
      },
      handleTextInput() {
        noteTyping();
        return false;
      },
      handlePaste() {
        noteTyping();
        return false;
      },
      handleKeyDown(_view, event) {
        if (["Backspace", "Delete", "Enter"].includes(event.key)) {
          noteTyping();
        }
        return false;
      },
      transformPastedHTML(html) {
        return html
          .replace(/<(img|table|thead|tbody|tr|td|th)[^>]*>[\s\S]*?<\/\1>/gi, "")
          .replace(/<img[^>]*>/gi, "");
      },
    },
    onUpdate({ editor: currentEditor }) {
      const plainText = currentEditor.getText({ blockSeparator: "\n" });
      const nextWordCount = countWords(plainText);
      latestRef.current = {
        ...latestRef.current,
        contentJSON: currentEditor.getJSON(),
        plainText,
        wordCount: nextWordCount,
      };
      dirtyRef.current = true;
      setWordCount(nextWordCount);
      setSaveStatus("dirty");
      scheduleRecovery();
    },
  });

  const scheduleRecovery = useCallback(() => {
    if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    draftTimerRef.current = setTimeout(() => {
      const latest = latestRef.current;
      db.recoveryDrafts
        .put({
          workId: initialWork.id,
          ...latest,
          savedAt: Date.now(),
        })
        .catch(() => undefined);
    }, 650);
  }, [initialWork.id]);

  const flush = useCallback(
    async (snapshotKind?: "closed") => {
      if (draftTimerRef.current) {
        clearTimeout(draftTimerRef.current);
        draftTimerRef.current = null;
      }
      const latest = latestRef.current;
      if (dirtyRef.current) {
        setSaveStatus("saving");
        const updatedAt = Date.now();
        await db.transaction("rw", db.works, db.recoveryDrafts, async () => {
          await db.works.update(initialWork.id, { ...latest, updatedAt });
          await db.recoveryDrafts.delete(initialWork.id);
        });
        await syncLinkedMaterials(latest.contentJSON, initialWork.id);
        dirtyRef.current = false;
        setSaveStatus("saved");
      }
      if (snapshotKind === "closed" && !closedSnapshotRef.current) {
        closedSnapshotRef.current = true;
        await saveRollingSnapshot({
          workId: initialWork.id,
          kind: "closed",
          ...latest,
        });
      }
      return latest;
    },
    [initialWork.id],
  );

  useEffect(() => {
    saveRollingSnapshot({
      workId: initialWork.id,
      kind: "opening",
      title: initialWork.title,
      contentJSON: initialWork.contentJSON,
      plainText: initialWork.plainText,
      wordCount: initialWork.wordCount,
    }).catch(() => undefined);

    const saveInterval = window.setInterval(() => {
      if (dirtyRef.current) flush().catch(() => undefined);
    }, 5000);
    const saveOnHide = () => {
      if (document.visibilityState === "hidden" && dirtyRef.current) {
        flush().catch(() => undefined);
      }
    };
    const saveOnPageHide = () => {
      if (dirtyRef.current) flush().catch(() => undefined);
    };
    document.addEventListener("visibilitychange", saveOnHide);
    window.addEventListener("pagehide", saveOnPageHide);
    return () => {
      window.clearInterval(saveInterval);
      document.removeEventListener("visibilitychange", saveOnHide);
      window.removeEventListener("pagehide", saveOnPageHide);
      flush("closed").catch(() => undefined);
    };
  }, [flush, initialWork]);

  const updateTitle = (nextTitle: string) => {
    setTitle(nextTitle);
    latestRef.current = { ...latestRef.current, title: nextTitle };
    dirtyRef.current = true;
    setSaveStatus("dirty");
    scheduleRecovery();
    noteTyping();
  };

  const applySnapshot = (snapshot: WorkSnapshot) => {
    if (!editor) return;
    editor.commands.setContent(snapshot.contentJSON);
    setTitle(snapshot.title);
    latestRef.current = {
      title: snapshot.title,
      contentJSON: snapshot.contentJSON,
      plainText: snapshot.plainText,
      wordCount: snapshot.wordCount,
    };
    setWordCount(snapshot.wordCount);
    dirtyRef.current = true;
    setSaveStatus("dirty");
    setRecoveryNotice(false);
  };

  const restoreOpeningSnapshot = async () => {
    const snapshots = await db.snapshots
      .where("workId")
      .equals(initialWork.id)
      .toArray();
    const snapshot = snapshots
      .sort((a, b) => b.createdAt - a.createdAt)
      .find((item) => item.kind === "opening");
    if (snapshot) applySnapshot(snapshot);
  };

  const closeWork = async () => {
    await flush("closed");
    navigate("/writing");
  };
  const getCurrentWordCount = useCallback(
    () => latestRef.current.wordCount,
    [],
  );
  const addTag = async () => {
    const nextTags = Array.from(new Set([...tags, ...parseTags(tagDraft)]));
    if (nextTags.length === tags.length) {
      setTagDraft("");
      return;
    }
    setTags(nextTags);
    setTagDraft("");
    await db.works.update(initialWork.id, {
      tags: nextTags,
      updatedAt: nowMs(),
    });
  };
  const removeTag = async (tag: string) => {
    const nextTags = tags.filter((item) => item !== tag);
    setTags(nextTags);
    await db.works.update(initialWork.id, {
      tags: nextTags,
      updatedAt: nowMs(),
    });
  };

  return (
    <div className={`writing-workspace theme-${initialWork.category}`}>
      <div className="editor-topline">
        <button className="back-button" onClick={closeWork}>
          ← writing
        </button>
        <div className="editor-context">
          <span className="editor-category">
            {CATEGORY_META[initialWork.category].name}
          </span>
          <SnapshotMenu workId={initialWork.id} onRestore={applySnapshot} />
        </div>
        <span className={`save-indicator is-${saveStatus}`} role="status">
          {saveStatus === "saved"
            ? "Saved locally"
            : saveStatus === "saving"
              ? "Saving"
              : "Unsaved changes"}
        </span>
      </div>

      {recoveryNotice && (
        <div className="recovery-banner">
          <span>Recovered content from an interrupted session.</span>
          <button onClick={restoreOpeningSnapshot}>Restore opening version</button>
          <button
            aria-label="Dismiss recovery notice"
            onClick={() => setRecoveryNotice(false)}
          >
            ×
          </button>
        </div>
      )}

      <div className="editor-layout">
        <article className="paper">
          <input
            className="document-title"
            value={title}
            onChange={(event) => updateTitle(event.target.value)}
            placeholder="Untitled work"
            aria-label="Work title"
          />
          <div className="editor-tags">
            {tags.map((tag) => (
              <button key={tag} onClick={() => removeTag(tag)} title="Remove tag">
                #{tag} <span>×</span>
              </button>
            ))}
            <label>
              <span className="sr-only">Add tag</span>
              <input
                value={tagDraft}
                onChange={(event) => setTagDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === ",") {
                    event.preventDefault();
                    addTag();
                  }
                }}
                onBlur={addTag}
                placeholder="+ tag"
              />
            </label>
          </div>
          <EditorToolbar editor={editor} />
          <EditorContent editor={editor} />
          <div className="paper-footer">
            <span>{wordCount} words</span>
            <span>{saveStatus === "saved" ? "Saved locally" : "Saving…"}</span>
          </div>
        </article>
        <WritingTimerPanel
          work={initialWork}
          currentWordCount={getCurrentWordCount}
          flush={flush}
          autoStartSignal={typingSignal}
          autoStartWordCount={autoStartWordCountRef.current}
          onSessionEnd={handleSessionEnd}
        />
        <SideNotesPanel workId={initialWork.id} />
      </div>
      {settlementSession && (
        <div className="settlement-overlay">
          <SettlementForm
            session={settlementSession}
            work={{ ...initialWork, title, wordCount }}
            navigate={navigate}
            onReturn={() => setSettlementSession(null)}
          />
        </div>
      )}
    </div>
  );
}

function useFloatingLayerTarget() {
  const [target, setTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setTarget(document.body);
  }, []);

  return target;
}

function SideNotesPanel({ workId }: { workId: string }) {
  const floatingLayerTarget = useFloatingLayerTarget();
  const notes = useLiveQuery(
    () => db.sideNotes.where("workId").equals(workId).toArray(),
    [workId],
    [],
  );

  const keepFiveOpen = async (exceptId?: string) => {
    const open = notes
      .filter((note) => note.isOpen && note.id !== exceptId)
      .sort((a, b) => a.openedAt - b.openedAt);
    if (open.length >= 5) {
      await db.sideNotes.update(open[0].id, { isOpen: false, updatedAt: Date.now() });
    }
  };

  const createNote = useCallback(async () => {
    const now = Date.now();
    const current = await db.sideNotes.where("workId").equals(workId).toArray();
    const open = current.filter((note) => note.isOpen).sort((a, b) => a.openedAt - b.openedAt);
    if (open.length >= 5) {
      await db.sideNotes.update(open[0].id, { isOpen: false, updatedAt: now });
    }
    const index = current.length % 5;
    const note: SideNote = {
      id: crypto.randomUUID(),
      workId,
      title: "",
      contentHtml: "",
      color: ["pink", "yellow", "blue", "lilac"][index % 4] as SideNote["color"],
      important: false,
      isOpen: true,
      openedAt: now,
      x: Math.max(16, window.innerWidth - 390 - index * 24),
      y: 118 + index * 34,
      width: 330,
      height: 280,
      createdAt: now,
      updatedAt: now,
    };
    await db.sideNotes.add(note);
  }, [workId]);

  useEffect(() => {
    const onShortcut = (event: KeyboardEvent) => {
      if (event.altKey && event.key.toLocaleLowerCase() === "n") {
        event.preventDefault();
        createNote();
      }
    };
    window.addEventListener("keydown", onShortcut);
    return () => window.removeEventListener("keydown", onShortcut);
  }, [createNote]);

  const openNote = async (note: SideNote) => {
    await keepFiveOpen(note.id);
    await db.sideNotes.update(note.id, {
      isOpen: true,
      openedAt: Date.now(),
      updatedAt: Date.now(),
    });
  };

  const hideAll = async () => {
    await Promise.all(
      notes.filter((note) => note.isOpen).map((note) =>
        db.sideNotes.update(note.id, { isOpen: false, updatedAt: Date.now() }),
      ),
    );
  };

  if (!floatingLayerTarget) return null;

  return createPortal(
    <>
      <aside className="side-notes-rail" aria-label="Side Notes">
        <div className="side-notes-rail-title">
          <span>Side Notes</span>
          <small>{notes.length}</small>
        </div>
        <button className="side-note-new" onClick={createNote} title="New Side Note (Alt+N)">＋</button>
        <div className="side-note-tabs">
          {notes
            .sort((a, b) => b.updatedAt - a.updatedAt)
            .map((note) => (
              <button
                key={note.id}
                className={`is-${note.color}${note.important ? " is-important" : ""}${note.isOpen ? " is-open" : ""}`}
                onClick={() => (note.isOpen
                  ? db.sideNotes.update(note.id, { isOpen: false, updatedAt: Date.now() })
                  : openNote(note))}
                title={note.title || "Untitled Side Note"}
              >
                {note.important ? "★" : "▤"}
                <span>{note.title || "Note"}</span>
              </button>
            ))}
        </div>
        {!!notes.some((note) => note.isOpen) && (
          <button className="side-notes-hide" onClick={hideAll}>Hide all</button>
        )}
      </aside>
      {notes
        .filter((note) => note.isOpen)
        .sort((a, b) => a.openedAt - b.openedAt)
        .map((note) => (
          <SideNoteWindow key={note.id} note={note} />
        ))}
    </>,
    floatingLayerTarget,
  );
}

function SideNoteWindow({ note }: { note: SideNote }) {
  const cardRef = useRef<HTMLElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const initialContentRef = useRef(note.contentHtml);
  const selectionRef = useRef<Range | null>(null);
  const saveTimerRef = useRef<number | null>(null);
  const dragRef = useRef<{ pointerId: number; offsetX: number; offsetY: number } | null>(null);

  const save = (changes: Partial<SideNote>, delay = 350) => {
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      db.sideNotes.update(note.id, { ...changes, updatedAt: Date.now() });
    }, delay);
  };

  useEffect(() => {
    const editor = editorRef.current;
    if (editor) editor.innerHTML = initialContentRef.current;
  }, [note.id]);

  const rememberSelection = () => {
    const editor = editorRef.current;
    const selection = window.getSelection();
    if (!editor || !selection?.rangeCount) return;
    const range = selection.getRangeAt(0);
    if (editor.contains(range.commonAncestorContainer)) {
      selectionRef.current = range.cloneRange();
    }
  };

  const restoreSelection = () => {
    const range = selectionRef.current;
    if (!range) return;
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  };

  useEffect(() => {
    const card = cardRef.current;
    if (!card) return;
    let first = true;
    let resizeTimer = 0;
    const observer = new ResizeObserver(() => {
      if (first) {
        first = false;
        return;
      }
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        const rect = card.getBoundingClientRect();
        db.sideNotes.update(note.id, {
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          updatedAt: Date.now(),
        });
      }, 300);
    });
    observer.observe(card);
    return () => {
      observer.disconnect();
      window.clearTimeout(resizeTimer);
    };
  }, [note.id]);

  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      const drag = dragRef.current;
      const card = cardRef.current;
      if (!drag || !card || event.pointerId !== drag.pointerId) return;
      const maxX = Math.max(8, window.innerWidth - card.offsetWidth - 8);
      const maxY = Math.max(68, window.innerHeight - card.offsetHeight - 8);
      const x = Math.min(maxX, Math.max(8, event.clientX - drag.offsetX));
      const y = Math.min(maxY, Math.max(68, event.clientY - drag.offsetY));
      card.style.left = `${x}px`;
      card.style.top = `${y}px`;
    };
    const onUp = (event: PointerEvent) => {
      if (!dragRef.current || event.pointerId !== dragRef.current.pointerId) return;
      const rect = cardRef.current?.getBoundingClientRect();
      dragRef.current = null;
      cardRef.current?.classList.remove("is-dragging");
      if (rect) {
        db.sideNotes.update(note.id, {
          x: Math.round(rect.left),
          y: Math.round(rect.top),
          openedAt: Date.now(),
          updatedAt: Date.now(),
        });
      }
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [note.id]);

  useEffect(() => {
    const keepVisible = () => {
      const card = cardRef.current;
      if (!card) return;
      const rect = card.getBoundingClientRect();
      const x = Math.min(Math.max(8, rect.left), Math.max(8, window.innerWidth - rect.width - 8));
      const y = Math.min(Math.max(68, rect.top), Math.max(68, window.innerHeight - rect.height - 8));
      card.style.left = `${x}px`;
      card.style.top = `${y}px`;
    };
    keepVisible();
    window.addEventListener("resize", keepVisible);
    return () => window.removeEventListener("resize", keepVisible);
  }, []);

  const format = (command: string, value?: string) => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.focus({ preventScroll: true });
    restoreSelection();
    document.execCommand(command, false, value);
    rememberSelection();
    save({ contentHtml: editor.innerHTML });
  };

  return (
    <article
      ref={cardRef}
      className={`side-note-window is-${note.color}${note.important ? " is-important" : ""}`}
      style={{
        left: note.x,
        top: note.y,
        width: note.width,
        height: note.height,
        zIndex: 920 + Math.min(70, Math.floor(note.openedAt / 1000) % 70),
      }}
      onPointerDown={() => db.sideNotes.update(note.id, { openedAt: Date.now() })}
    >
      <div
        className="side-note-titlebar"
        onPointerDown={(event) => {
          if ((event.target as HTMLElement).closest("button")) return;
          const rect = cardRef.current?.getBoundingClientRect();
          if (!rect) return;
          dragRef.current = {
            pointerId: event.pointerId,
            offsetX: event.clientX - rect.left,
            offsetY: event.clientY - rect.top,
          };
          cardRef.current?.classList.add("is-dragging");
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
      >
        <span>{note.important ? "★ IMPORTANT" : "SIDE NOTE"}</span>
        <div>
          <button
            title={note.important ? "Remove important mark" : "Mark important"}
            onClick={() => db.sideNotes.update(note.id, { important: !note.important, updatedAt: Date.now() })}
          >★</button>
          <button
            title="Hide"
            onClick={() => db.sideNotes.update(note.id, { isOpen: false, updatedAt: Date.now() })}
          >_</button>
        </div>
      </div>
      <input
        className="side-note-title"
        defaultValue={note.title}
        placeholder="Untitled Side Note"
        onInput={(event) => save({ title: event.currentTarget.value })}
      />
      <div className="side-note-toolbar" aria-label="Side Note formatting">
        <button onMouseDown={(event) => { event.preventDefault(); format("bold"); }}><b>B</b></button>
        <button onMouseDown={(event) => { event.preventDefault(); format("insertUnorderedList"); }}>• List</button>
        <button className="mark-yellow" onMouseDown={(event) => { event.preventDefault(); format("hiliteColor", "#fff0a6"); }}>Y</button>
        <button className="mark-pink" onMouseDown={(event) => { event.preventDefault(); format("hiliteColor", "#ffc5df"); }}>P</button>
        <select
          aria-label="Card color"
          value={note.color}
          onChange={(event) => db.sideNotes.update(note.id, {
            color: event.target.value as SideNote["color"],
            updatedAt: Date.now(),
          })}
        >
          <option value="pink">Pink</option>
          <option value="yellow">Yellow</option>
          <option value="blue">Blue</option>
          <option value="lilac">Lilac</option>
        </select>
        <button
          className="side-note-delete"
          onClick={() => {
            if (window.confirm("Delete this Side Note permanently?")) db.sideNotes.delete(note.id);
          }}
        >Delete</button>
      </div>
      <div
        ref={editorRef}
        className="side-note-editor"
        contentEditable
        suppressContentEditableWarning
        data-placeholder="Write a character note, setting, loose thought…"
        onFocus={rememberSelection}
        onKeyUp={rememberSelection}
        onMouseUp={rememberSelection}
        onInput={(event) => {
          rememberSelection();
          save({ contentHtml: event.currentTarget.innerHTML });
        }}
      />
      <div className="side-note-status">autosaved</div>
    </article>
  );
}

function SnapshotMenu({
  workId,
  onRestore,
}: {
  workId: string;
  onRestore: (snapshot: WorkSnapshot) => void;
}) {
  const snapshots = useLiveQuery(
    () => db.snapshots.where("workId").equals(workId).toArray(),
    [workId],
    [],
  )
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 2);

  return (
    <DismissibleDetails className="snapshot-menu" summary="Versions">
      <div>
        {snapshots.length ? (
          snapshots.map((snapshot) => (
            <button key={snapshot.id} onClick={() => onRestore(snapshot)}>
              <strong>
                {snapshot.kind === "opening"
                  ? "Before this edit"
                  : "Last closed"}
              </strong>
              <small>
                {formatDateTime(snapshot.createdAt)} · {snapshot.wordCount} words
              </small>
            </button>
          ))
        ) : (
          <span>No snapshots yet</span>
        )}
      </div>
    </DismissibleDetails>
  );
}

function EditorToolbar({
  editor,
}: {
  editor: Editor | null;
}) {
  if (!editor) return <div className="editor-toolbar" aria-hidden="true" />;

  const setLink = () => {
    const previous = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("Paste a web address", previous ?? "https://");
    if (url === null) return;
    if (!url.trim()) {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor
      .chain()
      .focus()
      .extendMarkRange("link")
      .setLink({ href: url.trim() })
      .run();
  };

  return (
    <div className="editor-toolbar" aria-label="Text formatting toolbar">
      <button
        className={editor.isActive("bold") ? "is-active" : ""}
        onClick={() => editor.chain().focus().toggleBold().run()}
        aria-label="Bold"
        title="Bold"
      >
        B
      </button>
      <button
        className={editor.isActive("italic") ? "is-active" : ""}
        onClick={() => editor.chain().focus().toggleItalic().run()}
        aria-label="Italic"
        title="Italic"
      >
        <em>I</em>
      </button>
      <button
        className={editor.isActive("bulletList") ? "is-active" : ""}
        onMouseDown={(event) => {
          event.preventDefault();
          editor.chain().focus().toggleBulletList().run();
        }}
        aria-label="Bullet list"
        title="Bullet list"
      >
        • List
      </button>
      <button
        className={editor.isActive("orderedList") ? "is-active" : ""}
        onMouseDown={(event) => {
          event.preventDefault();
          editor.chain().focus().toggleOrderedList().run();
        }}
        aria-label="Numbered list"
        title="Numbered list"
      >
        1. List
      </button>
      <button onClick={setLink} aria-label="Insert web link" title="Insert web link">
        Link
      </button>
      <span className="toolbar-divider" />
      <label className="toolbar-select">
        <span className="sr-only">Font size</span>
        <select
          defaultValue="17px"
          onChange={(event) =>
            editor.chain().focus().setFontSize(event.target.value).run()
          }
          aria-label="Font size"
        >
          <option value="14px">Small</option>
          <option value="17px">Regular</option>
          <option value="20px">Large</option>
          <option value="24px">XL</option>
        </select>
      </label>
      <button
        className="color-button color-button--black"
        onClick={() => editor.chain().focus().setColor("#282724").run()}
        aria-label="Black text"
        title="Black text"
      >
        A
      </button>
      <button
        className="color-button color-button--gray"
        onClick={() => editor.chain().focus().setColor("#a6a29b").run()}
        aria-label="Gray text"
        title="Gray text"
      >
        A
      </button>
      <button
        className="highlight-button highlight-button--yellow"
        onClick={() =>
          editor.chain().focus().toggleHighlight({ color: "#f5e7a8" }).run()
        }
        aria-label="Yellow highlight"
        title="Yellow highlight"
      >
        Y
      </button>
      <button
        className="highlight-button highlight-button--pink"
        onClick={() =>
          editor.chain().focus().toggleHighlight({ color: "#f4d4d8" }).run()
        }
        aria-label="Pink highlight"
        title="Pink highlight"
      >
        P
      </button>
      <span className="toolbar-divider" />
      <button
        onClick={() => editor.chain().focus().undo().run()}
        disabled={!editor.can().undo()}
        aria-label="Undo"
        title="Undo"
      >
        ↶
      </button>
      <button
        onClick={() => editor.chain().focus().redo().run()}
        disabled={!editor.can().redo()}
        aria-label="Redo"
        title="Redo"
      >
        ↷
      </button>
    </div>
  );
}

async function finishSession(
  session: WritingSession,
  endAt: number,
  reason: "manual" | "midnight-auto",
  endWordCount: number,
) {
  return db.transaction("rw", db.sessions, db.segments, async () => {
    const segments = await db.segments
      .where("sessionId")
      .equals(session.id)
      .toArray();
    const open = segments.find((segment) => segment.endedAt === null);
    if (open) {
      const safeEndAt = Math.max(open.startedAt, endAt);
      await db.segments.update(open.id, {
        endedAt: safeEndAt,
        durationMs: safeEndAt - open.startedAt,
        closeReason: reason === "manual" ? "manual" : "midnight",
      });
      open.endedAt = safeEndAt;
      open.durationMs = safeEndAt - open.startedAt;
    }
    const durationMs = sessionDuration(segments, endAt);
    const netWordDelta = endWordCount - session.startWordCount;
    const updated: WritingSession = {
      ...session,
      state: "ended",
      endedAt: endAt,
      endWordCount,
      netWordDelta,
      addedWordCount: Math.max(0, netWordDelta),
      durationMs,
      endedReason: reason,
      lastHeartbeatAt: endAt,
    };
    await db.sessions.put(updated);
    return updated;
  });
}

function WritingTimerPanel({
  work,
  currentWordCount,
  flush,
  autoStartSignal,
  autoStartWordCount,
  onSessionEnd,
}: {
  work: Work;
  currentWordCount: () => number;
  flush: () => Promise<{
    title: string;
    contentJSON: JSONContent;
    plainText: string;
    wordCount: number;
  }>;
  autoStartSignal: number;
  autoStartWordCount: number;
  onSessionEnd: (session: WritingSession) => void;
}) {
  const floatingLayerTarget = useFloatingLayerTarget();
  const [session, setSession] = useState<WritingSession | null>(null);
  const [segments, setSegments] = useState<SessionSegment[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const [message, setMessage] = useState("");
  const [position, setPosition] = useState<{ x: number; y: number } | null>(
    null,
  );
  const [minimized, setMinimized] = useState(false);
  const autoStartingRef = useRef(false);
  const handledAutoStartSignalRef = useRef(0);
  const panelRef = useRef<HTMLElement>(null);
  const positionRef = useRef<{ x: number; y: number } | null>(null);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);

  useEffect(() => {
    let active = true;
    db.settings.get("timer-position").then((setting) => {
      if (!active || !setting?.value || typeof setting.value !== "object") return;
      const saved = setting.value as { x?: unknown; y?: unknown };
      if (typeof saved.x === "number" && typeof saved.y === "number") {
        const nextPosition = {
          x: Math.max(8, Math.min(saved.x, window.innerWidth - 250)),
          y: Math.max(8, Math.min(saved.y, window.innerHeight - 70)),
        };
        positionRef.current = nextPosition;
        setPosition(nextPosition);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const keepInView = () => {
      setPosition((current) => {
        if (!current) return current;
        const nextPosition = {
          x: Math.max(8, Math.min(current.x, window.innerWidth - 250)),
          y: Math.max(8, Math.min(current.y, window.innerHeight - 70)),
        };
        positionRef.current = nextPosition;
        return nextPosition;
      });
    };
    window.addEventListener("resize", keepInView);
    return () => window.removeEventListener("resize", keepInView);
  }, []);

  const beginDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const rect = panelRef.current?.getBoundingClientRect();
    if (!rect) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    panelRef.current?.classList.add("is-dragging");
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: rect.left,
      originY: rect.top,
    };
  };

  const dragTimer = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const width = panelRef.current?.offsetWidth ?? 250;
    const height = panelRef.current?.offsetHeight ?? 70;
    const nextPosition = {
      x: Math.max(
        8,
        Math.min(
          drag.originX + event.clientX - drag.startX,
          window.innerWidth - width - 8,
        ),
      ),
      y: Math.max(
        8,
        Math.min(
          drag.originY + event.clientY - drag.startY,
          window.innerHeight - height - 8,
        ),
      ),
    };
    positionRef.current = nextPosition;
    if (panelRef.current) {
      panelRef.current.style.left = "0px";
      panelRef.current.style.top = "0px";
      panelRef.current.style.right = "auto";
      panelRef.current.style.transform = `translate3d(${nextPosition.x}px, ${nextPosition.y}px, 0)`;
    }
  };

  const finishDrag = async (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragRef.current || dragRef.current.pointerId !== event.pointerId) return;
    dragRef.current = null;
    panelRef.current?.classList.remove("is-dragging");
    const finalPosition = positionRef.current;
    if (!finalPosition) return;
    setPosition(finalPosition);
    await db.settings.put({
      key: "timer-position",
      value: finalPosition,
      updatedAt: Date.now(),
    });
  };

  const loadSession = useCallback(async () => {
    const candidates = await db.sessions
      .where("state")
      .anyOf(["running", "paused"])
      .toArray();
    const active = candidates.sort((a, b) => b.startedAt - a.startedAt)[0];
    if (!active) {
      setSession(null);
      setSegments([]);
      return;
    }
    if (active.workId !== work.id) {
      setMessage("Another work still has an unfinished session.");
      return;
    }

    let current = active;
    let currentSegments = await db.segments
      .where("sessionId")
      .equals(active.id)
      .toArray();
    const midnight = nextMidnight(active.startedAt);
    if (Date.now() >= midnight) {
      current = await finishSession(
        active,
        midnight,
        "midnight-auto",
        work.wordCount,
      );
      onSessionEnd(current);
      setSession(null);
      setSegments([]);
      return;
    }

    if (
      active.state === "running" &&
      Date.now() - active.lastHeartbeatAt > 30_000
    ) {
      const open = currentSegments.find((segment) => segment.endedAt === null);
      const cutoff = Math.max(
        open?.startedAt ?? active.startedAt,
        active.lastHeartbeatAt,
      );
      if (open) {
        await db.segments.update(open.id, {
          endedAt: cutoff,
          durationMs: cutoff - open.startedAt,
          closeReason: "recovery",
        });
      }
      current = { ...active, state: "paused", lastHeartbeatAt: cutoff };
      await db.sessions.put(current);
      currentSegments = await db.segments
        .where("sessionId")
        .equals(active.id)
        .toArray();
      setMessage("The previous session was interrupted and paused at its last heartbeat.");
    }
    setSession(current);
    setSegments(currentSegments);
  }, [onSessionEnd, work.id, work.wordCount]);

  useEffect(() => {
    const task = window.setTimeout(() => {
      loadSession().catch(() => setMessage("The timer record could not be loaded."));
    }, 0);
    return () => window.clearTimeout(task);
  }, [loadSession]);

  useEffect(() => {
    if (session?.state !== "running") return;
    const tick = window.setInterval(async () => {
      const time = Date.now();
      setNow(time);
      if (time >= nextMidnight(session.startedAt)) {
        const latest = await flush();
        const ended = await finishSession(
          session,
          nextMidnight(session.startedAt),
          "midnight-auto",
          latest.wordCount,
        );
        onSessionEnd(ended);
        setSession(null);
        setSegments([]);
      }
    }, 1000);
    const heartbeat = window.setInterval(() => {
      const time = Date.now();
      db.sessions
        .update(session.id, { lastHeartbeatAt: time })
        .catch(() => undefined);
      setSession((current) =>
        current ? { ...current, lastHeartbeatAt: time } : current,
      );
    }, 15_000);
    return () => {
      window.clearInterval(tick);
      window.clearInterval(heartbeat);
    };
  }, [flush, onSessionEnd, session]);

  const start = useCallback(async (startWordCountOverride?: number) => {
    const otherActive = (
      await db.sessions.where("state").anyOf(["running", "paused"]).toArray()
    ).sort((a, b) => b.startedAt - a.startedAt)[0];
    if (otherActive) {
      if (otherActive.workId !== work.id) {
        setMessage("Please end the session in your other work first.");
      }
      return;
    }
    const startedAt = Date.now();
    const nextSession: WritingSession = {
      id: crypto.randomUUID(),
      workId: work.id,
      state: "running",
      startedAt,
      endedAt: null,
      lastHeartbeatAt: startedAt,
      startWordCount: startWordCountOverride ?? currentWordCount(),
      endWordCount: null,
      netWordDelta: null,
      addedWordCount: null,
      durationMs: 0,
      mood: null,
      note: "",
      endedReason: null,
    };
    const segment: SessionSegment = {
      id: crypto.randomUUID(),
      sessionId: nextSession.id,
      startedAt,
      endedAt: null,
      durationMs: 0,
      closeReason: null,
    };
    await db.transaction("rw", db.sessions, db.segments, async () => {
      await db.sessions.add(nextSession);
      await db.segments.add(segment);
    });
    setSession(nextSession);
    setSegments([segment]);
    setNow(startedAt);
    setMessage("");
  }, [currentWordCount, flush, work.id]);

  const pause = async () => {
    if (!session || session.state !== "running") return;
    const endedAt = Date.now();
    const open = segments.find((segment) => segment.endedAt === null);
    if (open) {
      await db.segments.update(open.id, {
        endedAt,
        durationMs: endedAt - open.startedAt,
        closeReason: "pause",
      });
    }
    const paused = { ...session, state: "paused" as const };
    await db.sessions.put(paused);
    setSession(paused);
    setSegments(
      segments.map((segment) =>
        segment.id === open?.id
          ? {
              ...segment,
              endedAt,
              durationMs: endedAt - segment.startedAt,
              closeReason: "pause",
            }
          : segment,
      ),
    );
  };

  const resume = useCallback(async () => {
    if (!session || session.state !== "paused") return;
    const startedAt = Date.now();
    const segment: SessionSegment = {
      id: crypto.randomUUID(),
      sessionId: session.id,
      startedAt,
      endedAt: null,
      durationMs: 0,
      closeReason: null,
    };
    const running = {
      ...session,
      state: "running" as const,
      lastHeartbeatAt: startedAt,
    };
    await db.transaction("rw", db.sessions, db.segments, async () => {
      await db.sessions.put(running);
      await db.segments.add(segment);
    });
    setSession(running);
    setSegments([...segments, segment]);
    setNow(startedAt);
  }, [segments, session]);

  useEffect(() => {
    if (
      autoStartSignal <= handledAutoStartSignalRef.current ||
      autoStartingRef.current
    ) return;
    handledAutoStartSignalRef.current = autoStartSignal;
    const action =
      session === null
        ? () => start(autoStartWordCount)
        : session.state === "paused"
          ? resume
          : null;
    if (!action) return;
    autoStartingRef.current = true;
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      action().finally(() => {
        autoStartingRef.current = false;
      });
    });
    return () => {
      cancelled = true;
    };
  }, [autoStartSignal, autoStartWordCount, resume, session, start]);

  const end = async () => {
    if (!session || session.state === "ended") return;
    const latest = await flush();
    const ended = await finishSession(
      session,
      Date.now(),
      "manual",
      latest.wordCount,
    );
    onSessionEnd(ended);
    setSession(null);
    setSegments([]);
  };

  const elapsed = session ? sessionDuration(segments, now) : 0;

  if (!floatingLayerTarget) return null;

  return createPortal(
    <aside
      ref={panelRef}
      className={`timer-panel theme-${work.category}${minimized ? " is-minimized" : ""}`}
      style={
        position
          ? {
              left: 0,
              top: 0,
              right: "auto",
              transform: `translate3d(${position.x}px, ${position.y}px, 0)`,
            }
          : undefined
      }
    >
      <div
        className="timer-window-titlebar"
        onPointerDown={beginDrag}
        onPointerMove={dragTimer}
        onPointerUp={finishDrag}
        onPointerCancel={finishDrag}
      >
        <span>timer.app</span>
        <button
          onPointerDown={(event) => event.stopPropagation()}
          onClick={() => setMinimized((value) => !value)}
          aria-label={minimized ? "Restore timer" : "Minimize timer"}
        >
          {minimized ? "□" : "_"}
        </button>
      </div>
      <div className="timer-mini-row">
        <div className="timer-display">{formatDuration(elapsed)}</div>
        <span className={`session-state is-${session?.state ?? "idle"}`}>
          {session?.state === "running"
            ? "Writing"
            : session?.state === "paused"
              ? "Paused"
              : "Ready"}
        </span>
      </div>
      <div className="timer-content">
        {!session && (
          <button className="button button--primary button--wide" onClick={() => start()}>
            Start
          </button>
        )}
        {session?.state === "running" && (
          <div className="timer-actions">
            <button className="button button--secondary" onClick={pause}>
              Pause
            </button>
            <button className="button button--quiet" onClick={end}>
              End
            </button>
          </div>
        )}
        {session?.state === "paused" && (
          <div className="timer-actions">
            <button className="button button--primary" onClick={resume}>
              Resume
            </button>
            <button className="button button--quiet" onClick={end}>
              End
            </button>
          </div>
        )}
        {message && <p className="timer-message">{message}</p>}
      </div>
    </aside>,
    floatingLayerTarget,
  );
}

function SettlementPage({
  workId,
  sessionId,
  navigate,
}: {
  workId: string;
  sessionId: string;
  navigate: Navigate;
}) {
  const session = useLiveQuery(() => db.sessions.get(sessionId), [sessionId]);
  const work = useLiveQuery(() => db.works.get(workId), [workId]);

  if (!session || !work) {
    return <div className="loading-state">Preparing your session summary…</div>;
  }

  return (
    <SettlementForm
      key={session.id}
      session={session}
      work={work}
      navigate={navigate}
    />
  );
}

function SettlementForm({
  session,
  work,
  navigate,
  onReturn,
}: {
  session: WritingSession;
  work: Work;
  navigate: Navigate;
  onReturn?: () => void;
}) {
  const [mood, setMood] = useState<SessionMood | null>(session.mood);
  const [note, setNote] = useState(session.note);
  const [saving, setSaving] = useState(false);
  const playSound = useRetroSound();

  useEffect(() => {
    playSound("complete");
  }, [playSound]);

  const save = async () => {
    setSaving(true);
    await db.sessions.update(session.id, { mood, note });
    navigate("/");
  };

  return (
    <section className="settlement-page">
      <div className="settlement-card">
        <div className="dialog-titlebar settlement-titlebar">
          <span>session_summary.txt</span>
          <button
            onClick={() =>
              onReturn ? onReturn() : navigate(`/write/${work.id}`)
            }
            aria-label="Close session summary"
          >
            ×
          </button>
        </div>
        <div className="completion-mark" aria-hidden="true">
          ✓
        </div>
        <p className="eyebrow">
          {session.endedReason === "midnight-auto"
            ? "Saved automatically at midnight"
            : "Writing session complete"}
        </p>
        <h1>{work.title}</h1>
        <div className="settlement-stats">
          <div>
            <span>Writing time</span>
            <strong>{formatDuration(session.durationMs)}</strong>
          </div>
          <div>
            <span>Words added</span>
            <strong>{session.addedWordCount ?? 0}</strong>
          </div>
          <div>
            <span>Total words</span>
            <strong>{session.endWordCount ?? work.wordCount}</strong>
          </div>
        </div>

        <fieldset className="mood-picker">
          <legend>How did it feel?</legend>
          <div>
            {[
              { value: "smooth" as const, emoji: "🙂", label: "Flowing" },
              { value: "normal" as const, emoji: "😐", label: "Ordinary" },
              { value: "difficult" as const, emoji: "😣", label: "Difficult" },
            ].map((item) => (
              <label
                key={item.value}
                className={mood === item.value ? "is-selected" : ""}
              >
                <input
                  type="radio"
                  name="mood"
                  checked={mood === item.value}
                  onChange={() => setMood(item.value)}
                />
                <span>{item.emoji}</span>
                <small>{item.label}</small>
              </label>
            ))}
          </div>
        </fieldset>

        <label className="settlement-note">
          <span>Leave a note</span>
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="A thought, a problem, or what you want to write next…"
          />
        </label>
        <div className="settlement-actions">
          <button
            className="button button--primary"
            onClick={save}
            disabled={saving}
          >
            {saving ? "Saving…" : "Save and return home"}
          </button>
          <button
            className="button button--quiet"
            onClick={() =>
              onReturn ? onReturn() : navigate(`/write/${work.id}`)
            }
          >
            Return to work
          </button>
        </div>
      </div>
    </section>
  );
}

function MaterialsPage({ navigate }: { navigate: Navigate }) {
  const materials = useLiveQuery(
    () => db.materials.orderBy("updatedAt").reverse().toArray(),
    [],
    [],
  );
  const works = useLiveQuery(
    () => db.works.filter((work) => work.deletedAt === null).toArray(),
    [],
    [],
  );
  const materialReferences = useLiveQuery(
    () => db.materialReferences.toArray(),
    [],
    [],
  );
  const [selectedId, setSelectedId] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [tags, setTags] = useState("");
  const [query, setQuery] = useState("");
  const selected =
    materials.find((material) => material.id === selectedId) ?? materials[0];
  const visible = materials.filter((material) => {
    const haystack = `${material.title} ${material.url} ${material.note} ${material.tags.join(" ")}`;
    return haystack.toLocaleLowerCase().includes(query.toLocaleLowerCase());
  });

  const addMaterial = async () => {
    let nextUrl = url.trim();
    if (!nextUrl) return;
    if (!/^https?:\/\//i.test(nextUrl)) nextUrl = `https://${nextUrl}`;
    try {
      nextUrl = new URL(nextUrl).toString();
    } catch {
      return;
    }
    const existing = await db.materials.where("url").equals(nextUrl).first();
    if (existing) {
      setSelectedId(existing.id);
      setShowAdd(false);
      return;
    }
    const now = Date.now();
    const record: Material = {
      id: crypto.randomUUID(),
      title: title.trim() || materialTitle(nextUrl),
      url: nextUrl,
      note: note.trim(),
      tags: parseTags(tags),
      source: "manual",
      createdAt: now,
      updatedAt: now,
    };
    await db.materials.add(record);
    setSelectedId(record.id);
    setUrl("");
    setTitle("");
    setNote("");
    setTags("");
    setShowAdd(false);
  };

  const backlinks = selected
    ? works.filter((work) => documentLinks(work.contentJSON).includes(selected.url))
    : [];
  const deletedBacklinks = selected
    ? materialReferences.filter(
        (reference) =>
          reference.materialId === selected.id && reference.deletedAt !== null,
      )
    : [];

  return (
    <section className="content-page materials-page">
      <div className="page-heading page-heading--row">
        <div>
          <p className="eyebrow">bookmarks_and_fragments</p>
          <h1>materials</h1>
        </div>
        <button className="button button--primary" onClick={() => setShowAdd(true)}>
          Add a link
        </button>
      </div>

      {showAdd && (
        <div className="material-dialog" role="dialog" aria-label="Add material">
          <div className="window-titlebar">
            <span>new_material.url</span>
            <button onClick={() => setShowAdd(false)} aria-label="Close">×</button>
          </div>
          <label>
            Web address
            <input autoFocus value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://" />
          </label>
          <div className="material-form-row">
            <label>
              Title
              <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Optional" />
            </label>
            <label>
              Tags
              <input value={tags} onChange={(event) => setTags(event.target.value)} placeholder="research, idea" />
            </label>
          </div>
          <label>
            Note
            <textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="Why did you save this?" />
          </label>
          <button className="button button--primary" onClick={addMaterial}>Save material</button>
        </div>
      )}

      <div className="materials-window">
        <aside className="materials-list">
          <div className="window-titlebar">
            <span>library.idx</span>
            <i>{materials.length} items</i>
          </div>
          <input
            className="materials-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search materials…"
          />
          <div className="material-items">
            {visible.map((material) => (
              <button
                key={material.id}
                className={selected?.id === material.id ? "is-active" : ""}
                onClick={() => setSelectedId(material.id)}
              >
                <span aria-hidden="true">{material.source === "reference" ? "↗" : "⌑"}</span>
                <strong>{material.title}</strong>
                <small>{materialTitle(material.url)}</small>
              </button>
            ))}
            {!visible.length && <p>No saved links yet.</p>}
          </div>
        </aside>

        <article className="material-detail">
          <div className="window-titlebar">
            <span>{selected ? "material.info" : "no_selection"}</span>
            <i aria-hidden="true">_ □ ×</i>
          </div>
          {selected ? (
            <>
              <p className="eyebrow">{selected.source === "reference" ? "found in a work" : "saved manually"}</p>
              <h2>{selected.title}</h2>
              <a href={selected.url} target="_blank" rel="noreferrer">{selected.url}</a>
              {selected.note && <p className="material-note">{selected.note}</p>}
              {!!selected.tags.length && (
                <div className="material-tags">
                  {selected.tags.map((tag) => <span key={tag}>#{tag}</span>)}
                </div>
              )}
              <section className="backlinks">
                <h3>Linked from</h3>
                {backlinks.map((work) => (
                    <button key={work.id} onClick={() => navigate(`/write/${work.id}`)}>
                      <span className={`category-dot theme-${work.category}`} />
                      <strong>{work.title}</strong>
                      <small>{CATEGORY_META[work.category].name}</small>
                    </button>
                  ))}
                {deletedBacklinks.map((reference) => (
                  <div className="deleted-backlink" key={reference.id}>
                    <span aria-hidden="true">×</span>
                    <strong>Deleted work</strong>
                    <small>Referenced source retained</small>
                  </div>
                ))}
                {!backlinks.length && !deletedBacklinks.length && (
                  <p>This link has not been used in a work.</p>
                )}
              </section>
              <button
                className="delete-link"
                onClick={async () => {
                  await db.transaction(
                    "rw",
                    [db.materials, db.materialReferences],
                    async () => {
                      await db.materialReferences
                        .where("materialId")
                        .equals(selected.id)
                        .delete();
                      await db.materials.delete(selected.id);
                    },
                  );
                  setSelectedId("");
                }}
              >
                Remove from materials
              </button>
            </>
          ) : (
            <div className="empty-detail">Select a link to see its notes and backlinks.</div>
          )}
        </article>
      </div>
    </section>
  );
}

function DashboardPage({ navigate }: { navigate: Navigate }) {
  const works = useLiveQuery(
    () => db.works.filter((work) => work.deletedAt === null).toArray(),
    [],
    [],
  );
  const sessions = useLiveQuery(
    () => db.sessions.filter((session) => session.state === "ended").toArray(),
    [],
    [],
  );
  const [period, setPeriod] = useState<7 | 30 | 120 | 365>(30);
  const [selectedDate, setSelectedDate] = useState(localDateKey());
  const workById = new Map(works.map((work) => [work.id, work]));
  const writingDays = new Set(sessions.map((session) => localDateKey(session.startedAt)));
  const totalDuration = sessions.reduce((sum, session) => sum + session.durationMs, 0);
  const totalWords = works.reduce((sum, work) => sum + work.wordCount, 0);
  const historicalWords = sessions.reduce(
    (sum, session) => sum + Math.max(0, session.addedWordCount ?? 0),
    0,
  );
  const longest = Math.max(0, ...sessions.map((session) => session.durationMs));
  let streak = 0;
  const cursor = new Date();
  if (!writingDays.has(localDateKey(cursor.getTime()))) cursor.setDate(cursor.getDate() - 1);
  while (writingDays.has(localDateKey(cursor.getTime()))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  const daily = Array.from({ length: period }, (_, index) => {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - (period - index - 1));
    const key = localDateKey(date.getTime());
    const entries = sessions.filter((session) => localDateKey(session.startedAt) === key);
    return {
      key,
      label: new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(date),
      duration: entries.reduce((sum, session) => sum + session.durationMs, 0),
      words: entries.reduce((sum, session) => sum + (session.addedWordCount ?? 0), 0),
    };
  });
  const maxDaily = Math.max(1, ...daily.map((day) => day.duration));
  const calendar = Array.from({ length: 365 }, (_, index) => {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - (364 - index));
    const key = localDateKey(date.getTime());
    const entries = sessions.filter((session) => localDateKey(session.startedAt) === key);
    return {
      key,
      duration: entries.reduce((sum, session) => sum + session.durationMs, 0),
    };
  });
  const maxCalendar = Math.max(1, ...calendar.map((day) => day.duration));
  const selectedSessions = sessions.filter(
    (session) => localDateKey(session.startedAt) === selectedDate,
  );
  const categoryWords = (Object.keys(CATEGORY_META) as WorkCategory[]).map((category) => ({
    category,
    words: works.filter((work) => work.category === category).reduce((sum, work) => sum + work.wordCount, 0),
  }));
  const categoryTotal = Math.max(1, categoryWords.reduce((sum, item) => sum + item.words, 0));
  let angle = 0;
  const donut = `conic-gradient(${categoryWords
    .map((item) => {
      const start = angle;
      angle += (item.words / categoryTotal) * 360;
      const colors: Record<WorkCategory, string> = {
        "social-insight": "#8290aa",
        "life-essay": "#d5b37b",
        review: "#6f6878",
        "fan-fiction": "#c99db8",
      };
      return `${colors[item.category]} ${start}deg ${angle}deg`;
    })
    .join(",")})`;
  const moodCounts = {
    smooth: sessions.filter((session) => session.mood === "smooth").length,
    normal: sessions.filter((session) => session.mood === "normal").length,
    difficult: sessions.filter((session) => session.mood === "difficult").length,
  };
  const moodTotal = Math.max(1, moodCounts.smooth + moodCounts.normal + moodCounts.difficult);
  const timeBands = [
    { label: "00–06", start: 0, end: 6 },
    { label: "06–12", start: 6, end: 12 },
    { label: "12–18", start: 12, end: 18 },
    { label: "18–24", start: 18, end: 24 },
  ].map((band) => ({
    ...band,
    value: sessions
      .filter((session) => {
        const hour = new Date(session.startedAt).getHours();
        return hour >= band.start && hour < band.end;
      })
      .reduce((sum, session) => sum + session.durationMs, 0),
  }));
  const maxBand = Math.max(1, ...timeBands.map((band) => band.value));
  const workRanking = works
    .map((work) => ({
      work,
      duration: sessions
        .filter((session) => session.workId === work.id)
        .reduce((sum, session) => sum + session.durationMs, 0),
    }))
    .sort((a, b) => b.duration - a.duration)
    .slice(0, 5);
  const maxWorkDuration = Math.max(1, ...workRanking.map((item) => item.duration));

  return (
    <section className="content-page dashboard-page">
      <div className="page-heading">
        <p className="eyebrow">writer_history.dat</p>
        <h1>overview</h1>
      </div>
      <div className="metric-grid">
        {[
          ["Writing time", formatHours(totalDuration)],
          ["Current manuscript words", totalWords.toLocaleString()],
          ["Words written over time", historicalWords.toLocaleString()],
          ["Works", works.length.toString()],
          ["Current streak", `${streak} days`],
          ["Longest session", formatDuration(longest)],
        ].map(([label, value], index) => (
          <article key={label}>
            <span>0{index + 1}</span>
            <small>{label}</small>
            <strong>{value}</strong>
          </article>
        ))}
      </div>

      <section className="dashboard-window contribution-window">
        <div className="window-titlebar">
          <span>365_days.map</span>
          <i>writing / rest</i>
        </div>
        <div className="contribution-grid" aria-label="One year writing calendar">
          {calendar.map((day) => {
            const level = day.duration === 0 ? 0 : Math.max(1, Math.ceil((day.duration / maxCalendar) * 4));
            return (
              <button
                key={day.key}
                className={`level-${level}${selectedDate === day.key ? " is-selected" : ""}`}
                title={`${day.key}: ${Math.round(day.duration / 60000)} min`}
                onClick={() => setSelectedDate(day.key)}
              />
            );
          })}
        </div>
        <div className="calendar-detail">
          <div>
            <span>{selectedDate}</span>
            <strong>{selectedSessions.length ? `${Math.round(selectedSessions.reduce((sum, session) => sum + session.durationMs, 0) / 60000)} min written` : "Rest day"}</strong>
          </div>
          <div className="day-session-list">
            {selectedSessions.map((session) => {
              const linkedWork = workById.get(session.workId);
              return (
              <button
                key={session.id}
                className={!linkedWork ? "is-deleted-work" : ""}
                disabled={!linkedWork}
                onClick={() => linkedWork && navigate(`/write/${linkedWork.id}`)}
              >
                <strong>{workById.get(session.workId)?.title ?? "Deleted work"}</strong>
                <span>{formatDuration(session.durationMs)} · +{session.addedWordCount ?? 0} words · {moodLabel(session.mood)}</span>
                {session.note && <small>{session.note}</small>}
              </button>
              );
            })}
          </div>
        </div>
      </section>

      <section className="dashboard-window trend-window">
        <div className="window-titlebar">
          <span>writing_frequency.chart</span>
          <div className="period-tabs">
            {([7, 30, 120, 365] as const).map((days) => (
              <button key={days} className={period === days ? "is-active" : ""} onClick={() => setPeriod(days)}>
                {days === 365 ? "1 year" : `${days}d`}
              </button>
            ))}
          </div>
        </div>
        <div className="trend-chart">
          {daily.map((day, index) => (
            <div key={day.key} title={`${day.label}: ${Math.round(day.duration / 60000)} min, +${day.words} words`}>
              <i style={{ height: `${Math.max(day.duration ? 4 : 1, (day.duration / maxDaily) * 100)}%` }} />
              {(period <= 30 || index % Math.ceil(period / 12) === 0) && <small>{day.label}</small>}
            </div>
          ))}
        </div>
      </section>

      <div className="dashboard-split">
        <section className="dashboard-window">
          <div className="window-titlebar"><span>writing_types.pie</span><i>words</i></div>
          <div className="genre-chart">
            <div className="genre-donut" style={{ background: donut }}><span>{totalWords}<small>words</small></span></div>
            <div className="genre-legend">
              {categoryWords.map((item) => (
                <div key={item.category} className={`theme-${item.category}`}>
                  <i /><span>{CATEGORY_META[item.category].name}</span><strong>{Math.round((item.words / categoryTotal) * 100)}%</strong>
                </div>
              ))}
            </div>
          </div>
        </section>
        <section className="dashboard-window">
          <div className="window-titlebar"><span>session_mood.stats</span><i>{sessions.length} sessions</i></div>
          <div className="mood-bars">
            {[
              ["🙂 Flowing", moodCounts.smooth],
              ["😐 Ordinary", moodCounts.normal],
              ["😣 Difficult", moodCounts.difficult],
            ].map(([label, value]) => (
              <div key={label}>
                <span>{label}</span>
                <i><b style={{ width: `${(Number(value) / moodTotal) * 100}%` }} /></i>
                <strong>{value}</strong>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="dashboard-split">
        <section className="dashboard-window">
          <div className="window-titlebar"><span>time_of_day.hist</span><i>writing time</i></div>
          <div className="time-bands">
            {timeBands.map((band) => (
              <div key={band.label}><i style={{ height: `${Math.max(2, (band.value / maxBand) * 100)}%` }} /><span>{band.label}</span></div>
            ))}
          </div>
        </section>
        <section className="dashboard-window">
          <div className="window-titlebar"><span>works_rank.list</span><i>focus</i></div>
          <div className="work-ranking">
            {workRanking.map((item, index) => (
              <button key={item.work.id} onClick={() => navigate(`/write/${item.work.id}`)}>
                <span>0{index + 1}</span>
                <strong>{item.work.title}</strong>
                <i><b style={{ width: `${(item.duration / maxWorkDuration) * 100}%` }} /></i>
                <small>{formatHours(item.duration)}</small>
              </button>
            ))}
            {!workRanking.length && <p>No writing data yet.</p>}
          </div>
        </section>
      </div>
    </section>
  );
}

function formatHours(durationMs: number) {
  const minutes = Math.round(durationMs / 60000);
  return minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${minutes}m`;
}

function moodLabel(mood: SessionMood | null) {
  if (mood === "smooth") return "Flowing";
  if (mood === "normal") return "Ordinary";
  if (mood === "difficult") return "Difficult";
  return "No mood";
}

function ComingSoon({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <section className="coming-soon">
      <span aria-hidden="true">○</span>
      <p className="eyebrow">{eyebrow}</p>
      <h1>{title}</h1>
      <p>{description}</p>
    </section>
  );
}
