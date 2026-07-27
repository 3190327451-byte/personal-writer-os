"use client";

import Dexie, { type EntityTable } from "dexie";
import type {
  AppSetting,
  Material,
  RecoveryDraft,
  SessionSegment,
  Work,
  WorkSnapshot,
  WritingSession,
} from "./types";

class WriterDatabase extends Dexie {
  works!: EntityTable<Work, "id">;
  snapshots!: EntityTable<WorkSnapshot, "id">;
  recoveryDrafts!: EntityTable<RecoveryDraft, "workId">;
  sessions!: EntityTable<WritingSession, "id">;
  segments!: EntityTable<SessionSegment, "id">;
  settings!: EntityTable<AppSetting, "key">;
  materials!: EntityTable<Material, "id">;

  constructor() {
    super("personal-writer-os");
    this.version(1).stores({
      works: "id, category, updatedAt, createdAt, wordCount, deletedAt",
      snapshots: "id, workId, [workId+createdAt], createdAt",
      recoveryDrafts: "workId, savedAt",
      sessions: "id, workId, state, startedAt, endedAt, lastHeartbeatAt",
      segments: "id, sessionId, startedAt, endedAt",
      settings: "key, updatedAt",
    });
    this.version(2).stores({
      works: "id, category, updatedAt, createdAt, wordCount, deletedAt",
      snapshots: "id, workId, [workId+createdAt], createdAt",
      recoveryDrafts: "workId, savedAt",
      sessions: "id, workId, state, startedAt, endedAt, lastHeartbeatAt",
      segments: "id, sessionId, startedAt, endedAt",
      settings: "key, updatedAt",
      materials: "id, &url, updatedAt, createdAt",
    });
  }
}

export const db = new WriterDatabase();

export async function saveRollingSnapshot(
  snapshot: Omit<WorkSnapshot, "id" | "createdAt">,
) {
  const record: WorkSnapshot = {
    ...snapshot,
    id: crypto.randomUUID(),
    createdAt: Date.now(),
  };

  await db.transaction("rw", db.snapshots, async () => {
    await db.snapshots.add(record);
    const snapshots = await db.snapshots
      .where("workId")
      .equals(record.workId)
      .sortBy("createdAt");
    const overflow = snapshots.slice(0, Math.max(0, snapshots.length - 2));
    if (overflow.length) {
      await db.snapshots.bulkDelete(overflow.map((item) => item.id));
    }
  });
}

export async function exportBackup() {
  const [works, snapshots, recoveryDrafts, sessions, segments, settings, materials] =
    await Promise.all([
      db.works.toArray(),
      db.snapshots.toArray(),
      db.recoveryDrafts.toArray(),
      db.sessions.toArray(),
      db.segments.toArray(),
      db.settings.toArray(),
      db.materials.toArray(),
    ]);

  return {
    product: "Personal Writer OS",
    schemaVersion: 2,
    exportedAt: new Date().toISOString(),
    data: { works, snapshots, recoveryDrafts, sessions, segments, settings, materials },
  };
}

export async function importBackup(payload: unknown) {
  const backup = payload as {
    product?: string;
    schemaVersion?: number;
    data?: {
      works?: Work[];
      snapshots?: WorkSnapshot[];
      recoveryDrafts?: RecoveryDraft[];
      sessions?: WritingSession[];
      segments?: SessionSegment[];
      settings?: AppSetting[];
      materials?: Material[];
    };
  };

  if (
    backup.product !== "Personal Writer OS" ||
    ![1, 2].includes(backup.schemaVersion ?? 0) ||
    !backup.data
  ) {
    throw new Error("This is not a valid Personal Writer OS backup.");
  }

  await db.transaction(
    "rw",
    [
      db.works,
      db.snapshots,
      db.recoveryDrafts,
      db.sessions,
      db.segments,
      db.settings,
      db.materials,
    ],
    async () => {
      if (backup.data?.works?.length) {
        for (const incoming of backup.data.works) {
          const local = await db.works.get(incoming.id);
          if (!local || incoming.updatedAt >= local.updatedAt) {
            await db.works.put(incoming);
          }
        }
      }
      if (backup.data?.snapshots?.length) {
        await db.snapshots.bulkPut(backup.data.snapshots);
      }
      if (backup.data?.recoveryDrafts?.length) {
        await db.recoveryDrafts.bulkPut(backup.data.recoveryDrafts);
      }
      if (backup.data?.sessions?.length) {
        await db.sessions.bulkPut(backup.data.sessions);
      }
      if (backup.data?.segments?.length) {
        await db.segments.bulkPut(backup.data.segments);
      }
      if (backup.data?.settings?.length) {
        await db.settings.bulkPut(backup.data.settings);
      }
      if (backup.data?.materials?.length) {
        await db.materials.bulkPut(backup.data.materials);
      }
    },
  );
}
