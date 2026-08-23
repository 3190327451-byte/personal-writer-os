import type { JSONContent } from "@tiptap/react";

export type WorkCategory =
  | "social-insight"
  | "life-essay"
  | "review"
  | "fan-fiction";

export type SessionState = "running" | "paused" | "ended";
export type SessionMood = "smooth" | "normal" | "difficult";
export type SessionEndReason = "manual" | "midnight-auto" | "recovery-auto";

export interface Work {
  id: string;
  title: string;
  category: WorkCategory;
  tags?: string[];
  contentJSON: JSONContent;
  plainText: string;
  wordCount: number;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
}

export interface Material {
  id: string;
  title: string;
  url: string;
  note: string;
  tags: string[];
  source: "manual" | "reference";
  createdAt: number;
  updatedAt: number;
}

export interface MaterialReference {
  id: string;
  materialId: string;
  workId: string;
  deletedAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface DeletedWorkSource {
  id: string;
  deletedAt: number;
}

export interface SideNote {
  id: string;
  workId: string;
  title: string;
  contentHtml: string;
  color: "pink" | "yellow" | "blue" | "lilac";
  important: boolean;
  isOpen: boolean;
  openedAt: number;
  x: number;
  y: number;
  width: number;
  height: number;
  createdAt: number;
  updatedAt: number;
}

export interface WorkSnapshot {
  id: string;
  workId: string;
  kind: "opening" | "closed";
  title: string;
  contentJSON: JSONContent;
  plainText: string;
  wordCount: number;
  createdAt: number;
}

export interface RecoveryDraft {
  workId: string;
  title: string;
  contentJSON: JSONContent;
  plainText: string;
  wordCount: number;
  savedAt: number;
}

export interface WritingSession {
  id: string;
  workId: string;
  state: SessionState;
  startedAt: number;
  endedAt: number | null;
  lastHeartbeatAt: number;
  startWordCount: number;
  endWordCount: number | null;
  netWordDelta: number | null;
  addedWordCount: number | null;
  durationMs: number;
  mood: SessionMood | null;
  note: string;
  endedReason: SessionEndReason | null;
}

export interface SessionSegment {
  id: string;
  sessionId: string;
  startedAt: number;
  endedAt: number | null;
  durationMs: number;
  closeReason: "pause" | "manual" | "midnight" | "recovery" | null;
}

export interface AppSetting {
  key: string;
  value: unknown;
  updatedAt: number;
}

export const EMPTY_DOCUMENT: JSONContent = {
  type: "doc",
  content: [{ type: "paragraph" }],
};

export const CATEGORY_META: Record<
  WorkCategory,
  { name: string; shortName: string; description: string }
> = {
  "social-insight": {
    name: "Observations",
    shortName: "OBS",
    description: "Reason · culture · close reading",
  },
  "life-essay": {
    name: "Reflections",
    shortName: "NOTE",
    description: "Memory · warmth · inner life",
  },
  review: {
    name: "Reviews & Essays",
    shortName: "REVIEW",
    description: "Books · films · critical essays",
  },
  "fan-fiction": {
    name: "Fan Works",
    shortName: "FAN",
    description: "Fandom · fantasy · soft worlds",
  },
};
