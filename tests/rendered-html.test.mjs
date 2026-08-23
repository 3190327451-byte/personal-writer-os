import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

async function render(path = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(`http://localhost${path}`, {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the Personal Writer OS shell", async () => {
  const response = await render("/");
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Personal Writer OS<\/title>/i);
  assert.match(html, /manifest\.webmanifest/i);
  assert.match(html, /lang="en"/i);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton/i);
});

test("the catch-all route supports direct editor navigation", async () => {
  const response = await render("/write/example-work");
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
});

test("ships the local-first application and PWA assets", async () => {
  const [app, layout, manifest, serviceWorker] = await Promise.all([
    readFile(new URL("../app/WriterApp.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../public/manifest.webmanifest", import.meta.url), "utf8"),
    readFile(new URL("../public/sw.js", import.meta.url), "utf8"),
  ]);

  assert.match(app, /personal-writer-os/);
  assert.match(app, /}, 5000\);/);
  assert.match(app, /Saved locally/);
  assert.match(app, /Writing session complete/);
  assert.match(app, /timer-window-titlebar/);
  assert.match(app, /function WritingReminder/);
  assert.match(app, /Preview reminder/);
  assert.match(app, /settlement-overlay/);
  assert.match(app, /function MaterialsPage/);
  assert.match(app, /function DashboardPage/);
  assert.match(app, /parseTags/);
  assert.match(layout, /Personal Writer OS/);
  assert.match(layout, /manifest\.webmanifest/);
  assert.equal(JSON.parse(manifest).display, "standalone");
  assert.match(serviceWorker, /personal-writer-os-v5/);
  assert.match(serviceWorker, /url\.pathname\.startsWith\("\/assets\/"\)/);
  await Promise.all([
    access(new URL("../public/icon-192.png", import.meta.url)),
    access(new URL("../public/icon-512.png", import.meta.url)),
    access(new URL("../public/cursors/fountain-pen.png", import.meta.url)),
    access(new URL("../public/cursors/pencil.png", import.meta.url)),
    access(new URL("../public/cursors/dip-pen.png", import.meta.url)),
    access(new URL("../public/cursors/quill.png", import.meta.url)),
    access(new URL("../public/writing-tools/fountain-pen.png", import.meta.url)),
    access(new URL("../public/writing-tools/pencil.png", import.meta.url)),
    access(new URL("../public/writing-tools/dip-pen.png", import.meta.url)),
    access(new URL("../public/writing-tools/quill.png", import.meta.url)),
  ]);
});
