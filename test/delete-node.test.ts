import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { HmemStore } from "../src/hmem-store.js";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { unlinkSync } from "node:fs";
import { randomUUID } from "node:crypto";

function createTestStore(): { store: HmemStore; path: string } {
  const path = join(tmpdir(), `hmem-test-${randomUUID()}.hmem`);
  const store = new HmemStore(path);
  return { store, path };
}

describe("deleteNode", () => {
  let store: HmemStore;
  let dbPath: string;

  beforeEach(() => {
    const s = createTestStore();
    store = s.store;
    dbPath = s.path;
  });

  afterEach(() => {
    try { store.close(); } catch {}
    try { unlinkSync(dbPath); } catch {}
  });

  it("deletes a leaf sub-node", () => {
    // Create a root entry with one sub-node
    const { id: rootId } = store.write("T", "Test\n\tChild node", undefined, undefined, false, ["#test"]);
    const children = store.getChildNodes(rootId);
    const nodeId = children[0].id;

    // Delete the sub-node
    const result = store.deleteNode(nodeId);
    expect(result).toBe(true);

    // Verify node is gone
    const node = store.readNode(nodeId);
    expect(node).toBeNull();
  });

  it("deletes a sub-node with children recursively", () => {
    const { id: rootId } = store.write("L", "Lesson", undefined, undefined, false, ["#test"]);
    const { ids: [parentId] } = store.appendChildren(rootId, "Parent");
    const { ids: [childId] } = store.appendChildren(parentId, "Child");
    const { ids: [grandchildId] } = store.appendChildren(childId, "Grandchild");

    // Delete parent → should cascade to children
    const result = store.deleteNode(parentId);
    expect(result).toBe(true);

    expect(store.readNode(parentId)).toBeNull();
    expect(store.readNode(childId)).toBeNull();
    expect(store.readNode(grandchildId)).toBeNull();
  });

  it("preserves root entry and sibling nodes", () => {
    const { id: rootId } = store.write("D", "Decision", undefined, undefined, false, ["#test"]);
    const { ids: [nodeA] } = store.appendChildren(rootId, "Keep me");
    const { ids: [nodeB] } = store.appendChildren(rootId, "Delete me");
    const { ids: [nodeC] } = store.appendChildren(rootId, "Keep me too");

    store.deleteNode(nodeB);

    expect(store.readEntry(rootId)).not.toBeNull();
    expect(store.readNode(nodeA)).not.toBeNull();
    expect(store.readNode(nodeB)).toBeNull();
    expect(store.readNode(nodeC)).not.toBeNull();
  });

  it("throws on root entry ID (no dot)", () => {
    const { id: rootId } = store.write("E", "Error", undefined, undefined, false, ["#test"]);

    expect(() => store.deleteNode(rootId)).toThrow(/requires a sub-node ID/);
  });

  it("returns false for non-existent node", () => {
    const result = store.deleteNode("X9999.1");
    expect(result).toBe(false);
  });

  it("deletes associated tags", () => {
    const { id: rootId } = store.write("L", "Tagged\n\tNode with tag", undefined, undefined, false, ["#test"]);
    const children = store.getChildNodes(rootId);
    const nodeId = children[0].id;

    // Verify tag exists
    const tagsBefore = store.db.prepare(
      "SELECT tag FROM memory_tags WHERE entry_id = ?"
    ).all(nodeId) as { tag: string }[];
    expect(tagsBefore).toHaveLength(1);

    store.deleteNode(nodeId);

    const tagsAfter = store.db.prepare(
      "SELECT tag FROM memory_tags WHERE entry_id = ?"
    ).all(nodeId) as { tag: string }[];
    expect(tagsAfter).toHaveLength(0);
  });
});
