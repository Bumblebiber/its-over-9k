import { describe, it, expect } from "vitest";
import { resolveConflicts, LocalBlob } from "../src/sync/conflict.js";

function mkMemBlob(id: string, fields: Record<string, unknown> = {}): LocalBlob {
  return {
    client_proposed_id: id,
    data: JSON.stringify({ _table: "memories", id, prefix: id[0], seq: 1, ...fields }),
    updated_at: "2026-05-13T10:00:00Z",
  };
}

function mkNodeBlob(id: string, root: string, parent: string, content = ""): LocalBlob {
  return {
    client_proposed_id: id,
    data: JSON.stringify({
      _table: "memory_nodes",
      id,
      root_id: root,
      parent_id: parent,
      depth: 2,
      seq: 1,
      content,
    }),
    updated_at: "2026-05-13T10:00:00Z",
  };
}

function parseData(blob: LocalBlob): Record<string, unknown> {
  return JSON.parse(blob.data) as Record<string, unknown>;
}

describe("resolveConflicts — deep merge", () => {
  it("no collisions: passes blobs through unchanged", () => {
    const local = [mkMemBlob("P0010"), mkNodeBlob("P0010.1", "P0010", "P0010")];
    const result = resolveConflicts(new Set(["P0001", "P0002"]), local);
    expect(result.renamedCount).toBe(0);
    expect(result.renameMap).toEqual({});
    expect(result.blobs).toHaveLength(2);
    expect(parseData(result.blobs[0]).id).toBe("P0010");
  });

  it("renames colliding root + rewrites inner data.id", () => {
    const local = [mkMemBlob("P0001", { level_1: "MyProject" })];
    const result = resolveConflicts(new Set(["P0001"]), local);

    expect(result.renamedCount).toBe(1);
    expect(result.renameMap["P0001"]).toBe("P0002");
    expect(result.blobs[0].client_proposed_id).toBe("P0002");
    expect(parseData(result.blobs[0]).id).toBe("P0002");
    expect(parseData(result.blobs[0]).level_1).toBe("MyProject");
  });

  it("cascades rename into sub-nodes (id, root_id, parent_id)", () => {
    const local: LocalBlob[] = [
      mkMemBlob("P0001"),
      mkNodeBlob("P0001.1", "P0001", "P0001"),
      mkNodeBlob("P0001.1.2", "P0001", "P0001.1"),
    ];
    const result = resolveConflicts(new Set(["P0001"]), local);

    expect(result.renameMap["P0001"]).toBe("P0002");

    const root = parseData(result.blobs[0]);
    const subA = parseData(result.blobs[1]);
    const subB = parseData(result.blobs[2]);

    expect(root.id).toBe("P0002");
    expect(subA.id).toBe("P0002.1");
    expect(subA.root_id).toBe("P0002");
    expect(subA.parent_id).toBe("P0002");
    expect(subB.id).toBe("P0002.1.2");
    expect(subB.root_id).toBe("P0002");
    expect(subB.parent_id).toBe("P0002.1");

    expect(result.blobs[1].client_proposed_id).toBe("P0002.1");
    expect(result.blobs[2].client_proposed_id).toBe("P0002.1.2");
  });

  it("rewrites cross-links in level_* of renamed entry", () => {
    const local = [
      mkMemBlob("P0001", {
        level_1: "Refers to [P0001.2] and other [P0001] mentions",
        level_2: "And [P0001.2.5] deep nodes",
      }),
    ];
    const result = resolveConflicts(new Set(["P0001"]), local);
    const row = parseData(result.blobs[0]);
    expect(row.level_1).toBe("Refers to [P0002.2] and other [P0002] mentions");
    expect(row.level_2).toBe("And [P0002.2.5] deep nodes");
  });

  it("rewrites cross-links in OTHER local blobs that reference the renamed root", () => {
    const local = [
      mkMemBlob("P0001"),
      mkMemBlob("P0099", { level_1: "See [P0001.2] for context" }),
    ];
    const result = resolveConflicts(new Set(["P0001"]), local);
    expect(result.renameMap["P0001"]).toBe("P0002");
    expect(parseData(result.blobs[0]).id).toBe("P0002");
    const other = parseData(result.blobs[1]);
    expect(other.id).toBe("P0099");
    expect(other.level_1).toBe("See [P0002.2] for context");
  });

  it("rewrites cross-links in memory_nodes content", () => {
    const local: LocalBlob[] = [
      mkMemBlob("P0001"),
      mkNodeBlob("P0001.1", "P0001", "P0001", "see [P0001] root + [P0001.1] self"),
    ];
    const result = resolveConflicts(new Set(["P0001"]), local);
    const sub = parseData(result.blobs[1]);
    expect(sub.content).toBe("see [P0002] root + [P0002.1] self");
  });

  it("does not match cross-links that look similar but aren't (P00010)", () => {
    const local = [
      mkMemBlob("P0001"),
      mkMemBlob("P0010", { level_1: "Reference [P00010] and [P0001]" }),
    ];
    const result = resolveConflicts(new Set(["P0001"]), local);
    const row = parseData(result.blobs[1]);
    expect(row.level_1).toBe("Reference [P00010] and [P0002]");
  });

  it("avoids cascading: two collisions get distinct new IDs", () => {
    const local = [
      mkMemBlob("P0001", { level_1: "A" }),
      mkMemBlob("P0002", { level_1: "B" }),
    ];
    const result = resolveConflicts(new Set(["P0001", "P0002", "P0003"]), local);
    const newA = result.renameMap["P0001"];
    const newB = result.renameMap["P0002"];
    expect(newA).not.toBe(newB);
    expect(newA).not.toBe("P0001");
    expect(newB).not.toBe("P0002");
    expect(newA).not.toBe("P0003");
    expect(newB).not.toBe("P0003");
  });

  it("ignores synced blobs with numeric id", () => {
    const local: LocalBlob[] = [
      { id: 42, client_proposed_id: "P0001", data: JSON.stringify({ _table: "memories", id: "P0001" }) },
      mkMemBlob("P0001"),
    ];
    const result = resolveConflicts(new Set(["P0001"]), local);
    expect(result.renameMap["P0001"]).toBeDefined();
    expect(result.blobs[0].id).toBe(42);
    expect(result.blobs[0].client_proposed_id).toBe("P0001");
    expect(parseData(result.blobs[1]).id).not.toBe("P0001");
  });
});
