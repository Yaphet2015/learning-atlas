import { describe, expect, it } from "vitest";
import {
  createWalkthroughBoard,
  expandWalkthrough,
  newNote,
} from "../src/model/boards";
import { contextForNote } from "../src/model/context";
import { contextBundleSchema } from "../src/shared/validation";

function fixture() {
  const board = expandWalkthrough(createWalkthroughBoard(), "concept-render");
  const current = newNote(board, { x: 0, y: 0 });
  current.text = "为什么颜色变化通常不需要布局？";
  const privateNote = newNote(board, { x: 10, y: 10 });
  privateNote.text = "OTHER_NOTE_PRIVATE_TEXT";
  privateNote.messages.push({
    id: "private-message",
    role: "user",
    text: "PRIVATE_CHAT_HISTORY",
    createdAt: new Date().toISOString(),
  });
  board.notes.push(current, privateNote);
  board.relations.push({
    id: "relation-dom-style",
    source: "concept-dom",
    target: "concept-style",
    label: "为元素计算样式",
    kind: "cross",
  });
  board.nodes.push({
    ...board.nodes[1],
    id: "unrelated-topic",
    title: "UNRELATED_TOPIC",
    body: "UNRELATED_BODY",
  });
  return { board, current, privateNote };
}

describe("local note context", () => {
  it("uses only original topic and its own note for a free note", () => {
    const { board, current } = fixture();
    const context = contextForNote(board, current.id);
    expect(context.topic).toBe(board.topic);
    expect(context.references.map((ref) => ref.kind)).toEqual([
      "topic",
      "note",
    ]);
    expect(context.summary).toContain(current.text);
    expect(context.summary).not.toContain("OTHER_NOTE_PRIVATE_TEXT");
    expect(context.summary).not.toContain("PRIVATE_CHAT_HISTORY");
    expect(context.summary).not.toContain("UNRELATED");
  });
  it("includes selected node and its immediate branch but not distant or unrelated nodes", () => {
    const { board, current } = fixture();
    const context = contextForNote(board, current.id, {
      kind: "node",
      id: "concept-dom",
    });
    const ids = context.references.map((ref) => ref.id);
    expect(ids).toContain("concept-dom");
    expect(ids).toContain("concept-style");
    expect(ids).toContain("relation-dom-style");
    expect(ids).not.toContain("concept-layout");
    expect(ids).not.toContain("concept-paint");
    expect(context.summary).not.toContain("UNRELATED");
    expect(context.summary).not.toContain("OTHER_NOTE_PRIVATE_TEXT");
  });
  it("uses relation endpoints and their closest downstream branch", () => {
    const { board, current } = fixture();
    current.attachedTo = { kind: "relation", id: "relation-style-render" };
    const context = contextForNote(board, current.id);
    const ids = context.references.map((ref) => ref.id);
    expect(ids).toContain("relation-style-render");
    expect(ids).toContain("concept-style");
    expect(ids).toContain("concept-render");
    expect(ids).toContain("concept-layout");
    expect(ids).toContain("concept-paint");
    expect(ids).not.toContain("concept-dom");
    expect(ids).not.toContain("scene-browser");
  });
  it("explicit selected node takes priority over the attachment", () => {
    const { board, current } = fixture();
    current.attachedTo = { kind: "node", id: "concept-paint" };
    const context = contextForNote(board, current.id, {
      kind: "node",
      id: "concept-dom",
    });
    expect(context.references.some((ref) => ref.id === "concept-dom")).toBe(
      true,
    );
    expect(context.references.some((ref) => ref.id === "concept-paint")).toBe(
      false,
    );
  });
  it("does not read a different note merely because it is selected", () => {
    const { board, current, privateNote } = fixture();
    const context = contextForNote(board, current.id, {
      kind: "note",
      id: privateNote.id,
    });
    expect(context.references.map((ref) => ref.kind)).toEqual([
      "topic",
      "note",
    ]);
    expect(context.summary).not.toContain("OTHER_NOTE_PRIVATE_TEXT");
  });
  it("bounds content, references and one-hop branches", () => {
    const { board, current } = fixture();
    current.text = "A".repeat(20_000);
    for (let i = 0; i < 40; i += 1) {
      board.nodes.push({
        ...board.nodes[1],
        id: `neighbor-${i}`,
        body: "B".repeat(4_000),
      });
      board.relations.push({
        id: `edge-${i}`,
        source: "concept-dom",
        target: `neighbor-${i}`,
        label: "neighbor",
        kind: "cross",
      });
    }
    const context = contextForNote(board, current.id, {
      kind: "node",
      id: "concept-dom",
    });
    // topic, note, self, parent, ≤3 children, ≤3 cross-links (+ endpoints)
    expect(context.references.length).toBeLessThanOrEqual(11);
    expect(context.summary.length).toBeLessThan(20_000);
    expect(contextBundleSchema.safeParse(context).success).toBe(true);
  });
  it("includes live experiment state only when that scene is in the local context", () => {
    const { board, current } = fixture();
    board.scene.width = 220;
    board.scene.color = "#789b8d";
    board.scene.changed = "width";
    board.scene.prediction = "我预测后面的内容会移动";
    board.scene.explanation = "因为布局需要重新计算";
    const free = contextForNote(board, current.id);
    expect(free.summary).not.toContain("220px");
    const focused = contextForNote(board, current.id, {
      kind: "node",
      id: "scene-browser",
    });
    expect(focused.summary).toContain("220px");
    expect(focused.summary).toContain("#789b8d");
    expect(focused.summary).toContain(board.scene.prediction);
    expect(focused.summary).toContain(board.scene.explanation);
  });
  it("includes relevant diagram labels and clearly identifies analogies", () => {
    const { board, current } = fixture();
    board.nodes.find((node) => node.id === "concept-style")!.visual = {
      kind: "comparison",
      labels: ["衣架上的衣服", "元素的样式"],
      basis: "analogy",
      caption: "只是帮助理解的类比。",
    };
    const context = contextForNote(board, current.id, {
      kind: "node",
      id: "concept-style",
    });
    expect(context.summary).toContain("衣架上的衣服 对比 元素的样式");
    expect(context.summary).toContain("类比示意，并非实际结构");
  });
  it("fails clearly when the current note no longer exists", () => {
    const { board } = fixture();
    expect(() => contextForNote(board, "missing-note")).toThrow(
      "找不到这张便签",
    );
  });
});
