import { describe, expect, it } from "vitest";
import { createEmptyBoard, newNote } from "../src/model/boards";
import {
  applyOrganization,
  organizationContext,
  organizationSignature,
} from "../src/model/organization";
import type { Board } from "../src/shared/types";

function fixture(): Board {
  const board = createEmptyBoard("浏览器渲染");
  const root = board.nodes[0];
  for (let i = 0; i < 9; i++)
    board.nodes.push({
      id: `card-${i}`,
      kind: "concept",
      title: `概念${i}`,
      body: `完整正文${i}`,
      parentId: i ? `card-${i - 1}` : root.id,
      order: 0,
      status: "explained",
      hand: "我的解释",
    });
  board.relations = [
    {
      id: "edge",
      source: "card-0",
      target: "card-8",
      label: "旧关系",
      kind: "cross",
    },
  ];
  const note = newNote(board, { x: 0, y: 0 }, { kind: "relation", id: "edge" });
  note.text = "保留我的批注";
  board.notes.push(note);
  return board;
}
function revision(board: Board) {
  return {
    nodes: board.nodes.map(({ id, parentId, order, title, body }) => ({
      id,
      parentId,
      order,
      title,
      body,
    })),
    relations: structuredClone(board.relations),
  };
}

describe("whole-board organization", () => {
  it("sends complete deep cards and cross relations beyond the local review window", () => {
    const board = fixture();
    const context = organizationContext(board);
    expect(context.topic).toBe(board.topic);
    expect(context.review?.scope).toBe("all");
    expect(context.review?.nodes).toHaveLength(board.nodes.length);
    expect(context.review?.nodes.at(-1)).toMatchObject({
      id: "card-8",
      body: "完整正文8",
      level: 9,
    });
    expect(context.review?.relations).toEqual(board.relations);
  });
  it("applies hierarchy/content/relations together and preserves evidence and notes", () => {
    const board = fixture();
    const original = structuredClone(board);
    const result = revision(board);
    Object.assign(result.nodes[9], {
      parentId: board.nodes[0].id,
      order: 1,
      title: "校对后的概念",
      body: "校对后的解释",
    });
    result.relations = [];
    const next = applyOrganization(JSON.stringify(result), board);
    expect(next.nodes[9]).toMatchObject({
      ...result.nodes[9],
      status: "explained",
      hand: "我的解释",
    });
    expect(next.notes[0].text).toBe("保留我的批注");
    expect(next.notes[0].attachedTo).toBeUndefined();
    expect(next.relations).toEqual([]);
    expect(board).toEqual(original);
    expect(organizationSignature(next)).not.toBe(organizationSignature(board));
  });
  it.each([
    "missing",
    "duplicate",
    "unknown",
    "cycle",
    "parent",
    "root",
    "endpoint",
    "json",
  ])("rejects %s without modifying the board", (kind) => {
    const board = fixture();
    const before = structuredClone(board);
    const result = revision(board);
    if (kind === "missing") result.nodes.pop();
    if (kind === "duplicate") result.nodes[2] = result.nodes[1];
    if (kind === "unknown") result.nodes[2].id = "unknown";
    if (kind === "cycle") result.nodes[1].parentId = "card-8";
    if (kind === "parent") result.nodes[1].parentId = "unknown";
    if (kind === "root") result.nodes[0].title = "换个主题";
    if (kind === "endpoint") result.relations[0].target = "unknown";
    expect(() =>
      applyOrganization(kind === "json" ? "{" : JSON.stringify(result), board),
    ).toThrow();
    expect(board).toEqual(before);
  });
});
