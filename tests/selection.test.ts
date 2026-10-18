import { describe, expect, it } from "vitest";
import {
  boxPick,
  chatContext,
  manyCardsTitle,
  selectedCards,
  settle,
  toggleCard,
  toggleContextCard,
} from "../src/model/selection";
import { createWalkthroughBoard, newNote } from "../src/model/boards";
import { contextForNote } from "../src/model/context";
import { boardSchema } from "../src/shared/validation";

describe("canvas multi-select", () => {
  it("Shift/⌘-click grows a pick from the single selection and shrinks back", () => {
    let s = toggleCard({ single: "a", picked: [] }, "b");
    expect(s).toEqual({ single: null, picked: ["a", "b"] });
    s = toggleCard(s, "c");
    expect(s.picked).toEqual(["a", "b", "c"]);
    s = toggleCard(s, "a");
    expect(s.picked).toEqual(["b", "c"]);
    // Down to one card: an ordinary selection again.
    expect(toggleCard(s, "b")).toEqual({ single: "c", picked: [] });
    // Modifier-click with nothing selected selects that card.
    expect(toggleCard({ single: null, picked: [] }, "x")).toEqual({
      single: "x",
      picked: [],
    });
    // Modifier-click on the only selected card clears it.
    expect(toggleCard({ single: "x", picked: [] }, "x")).toEqual({
      single: null,
      picked: [],
    });
  });

  it("box selection replaces, or with a modifier adds to, the pick", () => {
    expect(boxPick({ single: "a", picked: [] }, ["b", "c"], false)).toEqual({
      single: null,
      picked: ["b", "c"],
    });
    expect(
      boxPick({ single: "a", picked: [] }, ["b", "a"], true).picked,
    ).toEqual(["a", "b"]);
    expect(boxPick({ single: null, picked: [] }, ["b"], false)).toEqual({
      single: "b",
      picked: [],
    });
    expect(settle([])).toEqual({ single: null, picked: [] });
  });
});

describe("context cards", () => {
  it("toggles picked cards and automatic references through the right field", () => {
    expect(toggleContextCard({}, "x", false)).toEqual({
      contextCards: ["x"],
      excludedRefs: [],
    });
    expect(toggleContextCard({ contextCards: ["x"] }, "x", false)).toEqual({
      contextCards: [],
      excludedRefs: [],
    });
    // An automatic neighbour is excluded rather than removed, and can come back.
    const off = toggleContextCard({}, "n", true);
    expect(off).toEqual({ contextCards: [], excludedRefs: ["node:n"] });
    expect(toggleContextCard(off, "n", true)).toEqual({
      contextCards: [],
      excludedRefs: [],
    });
  });

  it("picked cards are sent with the note, even far from the anchor", () => {
    const board = createWalkthroughBoard();
    const [dom, style, layout] = [
      "concept-dom",
      "concept-style",
      "concept-render",
    ];
    expect(board.nodes.some((n) => n.id === layout)).toBe(true);
    const note = newNote(board, { x: 0, y: 0 }, { kind: "node", id: dom });
    note.contextCards = [style, layout];
    board.notes.push(note);
    const ctx = contextForNote(board, note.id, null);
    const ids = ctx.references.map((r) => r.id);
    expect(ids.slice(0, 5)).toEqual([board.id, note.id, style, layout, dom]);
    expect(ctx.structure).toContain("◀ 当前卡片");
    expect(ctx.structure).toContain("§2 L1 样式计算 [待探索] ◀ 已选入");
    expect(ctx.structure).toContain("已选入的卡片：§3 布局与绘制");
    // Unticking one leaves it out of what is sent.
    note.excludedRefs = [`node:${layout}`];
    expect(
      contextForNote(board, note.id, null).references.map((r) => r.id),
    ).not.toContain(layout);
  });
});

describe("saved boards", () => {
  it("old notes without contextCards/createdAt still load, and new ones round-trip", () => {
    const board = createWalkthroughBoard();
    const old = newNote(
      board,
      { x: 0, y: 0 },
      { kind: "node", id: "concept-dom" },
    );
    delete old.createdAt;
    board.notes.push(old);
    expect(boardSchema.safeParse(board).success).toBe(true);
    const fresh = newNote(
      board,
      { x: 0, y: 0 },
      { kind: "node", id: "concept-dom" },
    );
    fresh.contextCards = ["concept-style"];
    board.notes.push(fresh);
    const parsed = boardSchema.parse(JSON.parse(JSON.stringify(board)));
    expect(parsed.notes.at(-1)?.contextCards).toEqual(["concept-style"]);
    expect(parsed.notes.at(-1)?.createdAt).toMatch(/^\d{4}-/);
  });
});

describe("selected cards as chat context (chatContext)", () => {
  it("reads the pick, else the single card", () => {
    expect(selectedCards({ single: null, picked: ["a", "b"] })).toEqual([
      "a",
      "b",
    ]);
    expect(selectedCards({ single: "a", picked: [] })).toEqual(["a"]);
    expect(selectedCards({ single: null, picked: [] })).toEqual([]);
  });
  it("anchors on the entry point's card and brings the other selected cards", () => {
    expect(chatContext(["a", "b", "c"], "b")).toEqual({
      anchor: "b",
      contextCards: ["a", "c"],
    });
    // The anchor alone selected: nothing extra, so an existing chat can be reopened.
    expect(chatContext(["b"], "b")).toEqual({ anchor: "b", contextCards: [] });
  });
  it("falls back to the first selected card, and drops cards that no longer exist", () => {
    expect(
      chatContext(["a", "gone", "c", "a"], undefined, (id) => id !== "gone"),
    ).toEqual({ anchor: "a", contextCards: ["c"] });
    expect(chatContext([], undefined)).toEqual({
      anchor: null,
      contextCards: [],
    });
    // The root as anchor (让 AI 带我开始) with another selected card.
    expect(chatContext(["x"], "root")).toEqual({
      anchor: "root",
      contextCards: ["x"],
    });
  });
  it("names a several-card conversation", () => {
    expect(manyCardsTitle("怎么赔", 2)).toBe("关于「怎么赔」等 3 张卡");
  });
});
