import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import Database from "better-sqlite3";
import { HmemStore } from "../src/hmem-store.js";
import { importFromStaging } from "../src/sync-bridge.js";
import { resolveConflicts, LocalBlob } from "../src/sync/conflict.js";
import { clearLocalTables } from "../src/cli-sync-setup.js";

const TMP = join(import.meta.dirname ?? __dirname, ".tmp-merge");

beforeEach(() => {
  rmSync(TMP, { recursive: true, force: true });
  mkdirSync(TMP, { recursive: true });
});
afterEach(() => rmSync(TMP, { recursive: true, force: true }));

function seedLocalSqlite(path: string): void {
  const store = new HmemStore(path);
  store.close();
  const db = new Database(path);
  db.prepare(
    `INSERT INTO memories (id, prefix, seq, created_at, level_1, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
  ).run("P0001", "P", 1, "2026-05-01T00:00:00Z", "MyProject (B's local) — see [P0001.1] for details", "2026-05-13T10:00:00Z");
  db.prepare(
    `INSERT INTO memory_nodes (id, parent_id, root_id, depth, seq, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run("P0001.1", "P0001", "P0001", 2, 1, "Sub-content for [P0001] root", "2026-05-01T00:00:00Z", "2026-05-13T10:00:00Z");
  db.close();
}

function mkServerBlob(id: number, proposedId: string, level1: string, updatedAt: string): LocalBlob {
  return {
    id,
    client_proposed_id: proposedId,
    data: JSON.stringify({
      _table: "memories",
      id: proposedId,
      prefix: proposedId[0],
      seq: parseInt(proposedId.slice(1)),
      created_at: "2026-05-01T00:00:00Z",
      level_1: level1,
      updated_at: updatedAt,
    }),
    updated_at: updatedAt,
  };
}

function mkLocalBlob(id: string, table: "memories" | "memory_nodes", extra: Record<string, unknown>): LocalBlob {
  return {
    client_proposed_id: id,
    data: JSON.stringify({ _table: table, id, ...extra }),
    updated_at: "2026-05-13T10:00:00Z",
  };
}

describe("end-to-end deep-merge for onboarding", () => {
  it("renames colliding local root + sub-node, imports cleanly without collision", async () => {
    const hmemPath = join(TMP, "local.hmem");
    const stagingPath = join(TMP, "staging.json");

    seedLocalSqlite(hmemPath);

    const stagingBlobs: LocalBlob[] = [
      mkServerBlob(101, "P0001", "DifferentProject (A's server)", "2026-05-13T09:00:00Z"),

      mkLocalBlob("P0001", "memories", {
        prefix: "P",
        seq: 1,
        created_at: "2026-05-01T00:00:00Z",
        level_1: "MyProject (B's local) — see [P0001.1] for details",
        updated_at: "2026-05-13T10:00:00Z",
      }),
      mkLocalBlob("P0001.1", "memory_nodes", {
        parent_id: "P0001",
        root_id: "P0001",
        depth: 2,
        seq: 1,
        content: "Sub-content for [P0001] root",
        created_at: "2026-05-01T00:00:00Z",
        updated_at: "2026-05-13T10:00:00Z",
      }),
    ];

    const synced = stagingBlobs.filter((b) => typeof b.id === "number");
    const localOnly = stagingBlobs.filter((b) => typeof b.id !== "number");
    const serverRootIds = new Set<string>(["P0001"]);

    const { blobs: resolvedLocal, renamedCount, renameMap } = resolveConflicts(serverRootIds, localOnly);
    expect(renamedCount).toBe(1);
    expect(renameMap["P0001"]).toBe("P0002");

    const merged = [...synced, ...resolvedLocal];
    writeFileSync(stagingPath, JSON.stringify(merged));

    clearLocalTables(hmemPath);
    await importFromStaging(stagingPath, hmemPath);

    const db = new Database(hmemPath, { readonly: true });
    try {
      const p1 = db.prepare("SELECT level_1 FROM memories WHERE id = ?").get("P0001") as { level_1: string };
      const p2 = db.prepare("SELECT level_1 FROM memories WHERE id = ?").get("P0002") as { level_1: string };
      expect(p1.level_1).toBe("DifferentProject (A's server)");
      expect(p2.level_1).toBe("MyProject (B's local) — see [P0002.1] for details");

      const subOld = db.prepare("SELECT id FROM memory_nodes WHERE id = ?").get("P0001.1");
      const subNew = db.prepare("SELECT root_id, parent_id, content FROM memory_nodes WHERE id = ?").get("P0002.1") as {
        root_id: string;
        parent_id: string;
        content: string;
      };
      expect(subOld).toBeUndefined();
      expect(subNew.root_id).toBe("P0002");
      expect(subNew.parent_id).toBe("P0002");
      expect(subNew.content).toBe("Sub-content for [P0002] root");
    } finally {
      db.close();
    }
  });

  it("no rename when local IDs don't collide with server", async () => {
    const hmemPath = join(TMP, "no-collision.hmem");
    const stagingPath = join(TMP, "staging.json");

    const store = new HmemStore(hmemPath);
    store.close();

    const localOnly: LocalBlob[] = [
      mkLocalBlob("P0010", "memories", {
        prefix: "P",
        seq: 10,
        created_at: "2026-05-01T00:00:00Z",
        level_1: "Unique entry",
        updated_at: "2026-05-13T10:00:00Z",
      }),
    ];
    const { blobs, renamedCount } = resolveConflicts(new Set(["P0001", "P0002"]), localOnly);
    expect(renamedCount).toBe(0);

    writeFileSync(stagingPath, JSON.stringify(blobs));
    await importFromStaging(stagingPath, hmemPath);

    const db = new Database(hmemPath, { readonly: true });
    try {
      const row = db.prepare("SELECT level_1 FROM memories WHERE id = ?").get("P0010") as { level_1: string };
      expect(row.level_1).toBe("Unique entry");
    } finally {
      db.close();
    }
  });
});
