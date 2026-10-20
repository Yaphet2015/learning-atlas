import { expect, it } from "vitest";
import { createEmptyBoard, newNote } from "../src/model/boards";
import { applyCanvasEdits } from "../src/shared/canvas";
import { reconcileCanvasResult } from "../src/model/canvas-result";

it("keeps live note deletion, edits and reference choices while adopting a merged graph", () => {
  const before = createEmptyBoard("浏览器渲染");
  for (const id of ["dom", "style", "layout"])
    before.nodes.push({
      id,
      kind: "concept",
      title: id,
      body: id,
      parentId: before.nodes[0].id,
      order: before.nodes.length - 1,
      status: "unseen",
    });
  const edited = newNote(before, { x: 0, y: 0 }, { kind: "node", id: "dom" });
  const deleted = newNote(before, { x: 0, y: 0 });
  const redirected = newNote(
    before,
    { x: 0, y: 0 },
    { kind: "node", id: "dom" },
  );
  before.notes = [edited, deleted, redirected];
  const result = applyCanvasEdits(
    before,
    [{ op: "merge", id: "dom", targetId: "style", reason: "测试合并" }],
    "run",
    "2026-10-19T00:00:00Z",
  );
  const live = structuredClone(before);
  live.notes = live.notes.filter((note) => note.id !== deleted.id);
  Object.assign(live.notes[0], {
    text: "提交期间写下的理解",
    attachedTo: { kind: "node", id: "layout" },
    contextCards: ["layout"],
    excludedRefs: ["node:style"],
    messages: [
      { id: "latest", role: "user", text: "继续问", createdAt: live.createdAt },
    ],
  });
  const added = newNote(live, { x: 0, y: 0 });
  live.notes.push(added);
  const reconciled = reconcileCanvasResult(live, result, before);
  expect(reconciled.nodes.some((node) => node.id === "dom")).toBe(false);
  expect(reconciled.notes.map((note) => note.id)).toEqual([
    edited.id,
    redirected.id,
    added.id,
  ]);
  expect(reconciled.notes[0]).toEqual(live.notes[0]);
  expect(reconciled.notes[1].attachedTo?.id).toBe("style");
  const undo = reconcileCanvasResult(reconciled, before);
  expect(undo.nodes.some((node) => node.id === "dom")).toBe(true);
  expect(undo.notes.some((note) => note.id === deleted.id)).toBe(false);
  expect(undo.notes[0].text).toBe("提交期间写下的理解");
  expect(undo.notes[1].attachedTo?.id).toBe("dom");
});
