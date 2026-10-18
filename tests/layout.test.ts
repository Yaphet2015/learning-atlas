import { describe, expect, it } from "vitest";
import {
  CARD_H,
  CARD_MAX,
  CARD_MIN as CARD_W,
  GAP_GROUP,
  GAP_IN,
  ROOT_H,
  ROOT_W,
  ROW_GAP,
  cardWidth,
  insertSlot,
  layoutTree,
} from "../src/model/layout";

type N = {
  id: string;
  parentId: string | null;
  order: number;
  kind: "concept";
};
const n = (id: string, parentId: string | null, order = 0): N => ({
  id,
  parentId,
  order,
  kind: "concept",
});
// The v4 reference map (redesign/v4/src/tree.js ATLAS).
const atlas = [
  n("q", null),
  n("dom", "q", 0),
  n("style", "q", 1),
  n("layout", "q", 2),
  n("paint", "q", 3),
  n("tok", "dom", 0),
  n("tree", "dom", 1),
  n("sel", "style", 0),
  n("cas", "style", 1),
  n("box", "layout", 0),
];

describe("layoutTree", () => {
  it("puts each level on one row, below the tallest card of the row above", () => {
    const { positions, rows } = layoutTree(atlas);
    expect(positions.get("q")!.y).toBe(100);
    expect(positions.get("dom")!.y).toBe(100 + ROOT_H + ROW_GAP);
    expect(positions.get("tok")!.y).toBe(100 + ROOT_H + CARD_H + 2 * ROW_GAP);
    expect(positions.get("tok")!.level).toBe(2);
    expect(rows).toEqual([100, 346, 572]);
    // A tall card on level 1 pushes level 2 down instead of crossing its rule.
    const tall = layoutTree(atlas, {
      heights: new Map([
        ["q", 140],
        ["style", 260],
      ]),
    });
    expect(tall.rows).toEqual([100, 336, 692]);
    expect(tall.positions.get("sel")!.y).toBe(692);
  });
  it("sizes cards 240–320 from the title", () => {
    expect(cardWidth("保什么")).toBe(240);
    expect(cardWidth("一个特别特别长的标题，长到要折两行才能放下")).toBe(
      CARD_MAX,
    );
    const w = layoutTree(atlas, {
      widthOf: (n) => (n.id === "dom" ? 300 : 240),
    });
    expect(w.positions.get("dom")!.w).toBe(300);
    expect(w.positions.get("q")!.w).toBe(ROOT_W);
  });
  it("lays the 重疾险 first level as 4 × 240 with 28px gaps (1044 wide)", () => {
    const four = [
      n("q", null),
      ...["a", "b", "c", "d"].map((id, i) => n(id, "q", i)),
      n("a1", "a", 0),
      n("b1", "b", 0),
    ];
    const { positions } = layoutTree(four);
    const row = ["a", "b", "c", "d"].map((id) => positions.get(id)!);
    expect(row[3].x + row[3].w - row[0].x).toBe(1044);
    expect(row[0].x + 1044 / 2).toBeCloseTo(0);
  });
  it("orders siblings left to right by order, regardless of array order", () => {
    const { positions } = layoutTree([...atlas].reverse());
    const xs = ["dom", "style", "layout", "paint"].map(
      (id) => positions.get(id)!.x,
    );
    expect([...xs].sort((a, b) => a - b)).toEqual(xs);
  });
  it("uses the spec gaps and widths and never overlaps a row", () => {
    const { positions } = layoutTree(atlas);
    expect(positions.get("q")!.w).toBe(ROOT_W);
    expect(positions.get("dom")!.w).toBe(CARD_W);
    // dom's subtree = two leaves + gapIn
    // dom and style both fan out wider than a card: GAP_GROUP between them.
    const domW = 2 * CARD_W + GAP_IN;
    expect(positions.get("style")!.x - positions.get("dom")!.x).toBe(
      (domW + 2 * CARD_W + GAP_IN) / 2 + GAP_GROUP,
    );
    // layout (one child, no wider) and paint (leaf) sit GAP_IN apart.
    expect(positions.get("paint")!.x - positions.get("layout")!.x).toBe(
      CARD_W + GAP_IN,
    );
    expect(positions.get("tree")!.x - positions.get("tok")!.x).toBe(
      CARD_W + GAP_IN,
    );
    for (const level of [1, 2]) {
      const row = [...positions.values()]
        .filter((p) => p.level === level)
        .sort((a, b) => a.x - b.x);
      for (let i = 1; i < row.length; i++)
        expect(row[i].x).toBeGreaterThanOrEqual(row[i - 1].x + row[i - 1].w);
    }
  });
  it("centres parents over children and the tree on x = 0", () => {
    const { positions } = layoutTree(atlas);
    const mid = (id: string) => positions.get(id)!.x + positions.get(id)!.w / 2;
    expect(mid("dom")).toBeCloseTo((mid("tok") + mid("tree")) / 2);
    const xs = [...positions.values()];
    const left = Math.min(...xs.map((p) => p.x));
    const right = Math.max(...xs.map((p) => p.x + p.w));
    expect(left + right).toBeCloseTo(0);
  });
  it("is deterministic and handles a lone root and an empty map", () => {
    expect([...layoutTree(atlas).positions]).toEqual([
      ...layoutTree(atlas).positions,
    ]);
    expect(layoutTree([n("q", null)]).positions.get("q")).toEqual({
      x: -ROOT_W / 2,
      y: 100,
      w: ROOT_W,
      level: 0,
    });
    expect(layoutTree([]).rootId).toBeNull();
  });
  it("lays out a deep chain without recursion limits", () => {
    const chain = [n("c0", null)];
    for (let i = 1; i < 400; i++) chain.push(n(`c${i}`, `c${i - 1}`));
    expect(layoutTree(chain).positions.get("c399")!.level).toBe(399);
  });
});

describe("insertSlot", () => {
  const layout = layoutTree(atlas);
  const p = (id: string) => layout.positions.get(id)!;
  it("reorders within the row by horizontal position", () => {
    const right = p("paint").x + p("paint").w;
    expect(insertSlot("dom", { x: right + 10, y: 346 }, atlas, layout)).toEqual(
      { kind: "reorder", parentId: "q", order: 3 },
    );
    expect(
      insertSlot("paint", { x: p("dom").x - 50, y: 360 }, atlas, layout),
    ).toEqual({ kind: "reorder", parentId: "q", order: 0 });
  });
  it("re-parents when dropped just below another card", () => {
    const target = p("paint");
    expect(
      insertSlot(
        "box",
        { x: target.x + 20, y: target.y + 130 },
        atlas,
        layout,
        new Map([["paint", 110]]),
      ),
    ).toEqual({ kind: "reparent", parentId: "paint", order: 0 });
  });
  it("never offers a slot inside the dragged subtree, and springs back elsewhere", () => {
    const tok = p("tok");
    const slot = insertSlot(
      "dom",
      { x: tok.x + 10, y: tok.y + 130 },
      atlas,
      layout,
      new Map([["tok", 110]]),
    );
    expect(slot).toBeNull();
    expect(insertSlot("dom", { x: 0, y: 2000 }, atlas, layout)).toBeNull();
    expect(insertSlot("q", { x: 0, y: 100 }, atlas, layout)).toBeNull();
  });
});
