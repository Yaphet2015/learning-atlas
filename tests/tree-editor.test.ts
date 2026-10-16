import { describe, expect, it } from "vitest";
import { createWalkthroughBoard } from "../src/model/boards";
import {
  addChild,
  addSibling,
  removeSelection,
  reorder,
  reparent,
} from "../src/model/editor";
import { boardSchema } from "../src/shared/validation";
import type { Board } from "../src/shared/types";

const row = (b: Board, parentId: string) =>
  b.nodes
    .filter((n) => n.parentId === parentId)
    .sort((a, c) => a.order - c.order)
    .map((n) => n.id);
const valid = (b: Board) => expect(boardSchema.safeParse(b).success).toBe(true);

describe("tree editing", () => {
  const base = createWalkthroughBoard();
  it("Tab adds an unseen child at the end of the row", () => {
    const b = addChild(base, "scene-browser", "n1");
    expect(row(b, "scene-browser")).toEqual([
      "concept-dom",
      "concept-style",
      "concept-render",
      "n1",
    ]);
    expect(b.nodes.find((n) => n.id === "n1")!.status).toBe("unseen");
    valid(b);
  });
  it("Enter inserts a sibling right after, shifting later ones", () => {
    const b = addSibling(base, "concept-dom", "n1");
    expect(row(b, "scene-browser")).toEqual([
      "concept-dom",
      "n1",
      "concept-style",
      "concept-render",
    ]);
    expect(addSibling(base, "scene-browser", "n2")).toBe(base);
    valid(b);
  });
  it("reorders within a row and re-parents with its subtree", () => {
    expect(row(reorder(base, "concept-render", 0), "scene-browser")).toEqual([
      "concept-render",
      "concept-dom",
      "concept-style",
    ]);
    const withChild = addChild(base, "concept-style", "k");
    const moved = reparent(withChild, "concept-style", "concept-dom");
    expect(row(moved, "scene-browser")).toEqual([
      "concept-dom",
      "concept-render",
    ]);
    expect(row(moved, "concept-dom")).toEqual(["concept-style"]);
    expect(moved.nodes.find((n) => n.id === "k")!.parentId).toBe(
      "concept-style",
    );
    valid(moved);
  });
  it("refuses to move a node under its own descendant or the root anywhere", () => {
    const b = addChild(base, "concept-dom", "k");
    expect(reparent(b, "concept-dom", "k")).toBe(b);
    expect(reparent(b, "scene-browser", "k")).toBe(b);
  });
  it("removing a node promotes its children into its slot; the root stays", () => {
    const b = addChild(
      addChild(base, "concept-style", "a"),
      "concept-style",
      "b",
    );
    const r = removeSelection(b, { kind: "node", id: "concept-style" });
    expect(row(r, "scene-browser")).toEqual([
      "concept-dom",
      "a",
      "b",
      "concept-render",
    ]);
    valid(r);
    expect(removeSelection(b, { kind: "node", id: "scene-browser" })).toBe(b);
  });
});
