import { describe, expect, it } from "vitest";
import { cardReview } from "../src/model/card-review";
import { createEmptyBoard } from "../src/model/boards";
import { addParent, addRoot } from "../src/model/editor";
import { contextBundleSchema } from "../src/shared/validation";

function chain() {
  const board = createEmptyBoard("用户最初的问题");
  board.nodes = Array.from({ length: 11 }, (_, level) => ({
    id: `card-${level}`,
    kind: "concept" as const,
    title: `第 ${level} 层`,
    body: `第 ${level} 层的知识内容`,
    parentId: level === 0 ? null : `card-${level - 1}`,
    order: 0,
    status: "unseen" as const,
    // Persisted/cached level is deliberately wrong; parentId decides the level.
    level: 99,
  }));
  return board;
}

describe("four-level card review preparation", () => {
  it("includes exactly four levels above and below, with real parents and contents", () => {
    const board = chain();
    board.nodes.reverse();
    const review = cardReview(board, ["card-5"]);
    expect(review.radius).toBe(4);
    expect(review.nodes.map((n) => n.id)).toEqual(
      Array.from({ length: 9 }, (_, i) => `card-${i + 1}`),
    );
    expect(review.nodes[0]).toMatchObject({
      id: "card-1",
      parentId: "card-0",
      level: 1,
      body: "第 1 层的知识内容",
    });
    expect(review.nodes.at(-1)?.level).toBe(9);
    expect(board.nodes[0].level).toBe(99);
    expect(
      contextBundleSchema.parse({
        topic: board.topic,
        references: [],
        summary: "",
        review,
      }).topic,
    ).toBe("用户最初的问题");
  });

  it("keeps all parallel cards and full bodies beyond outline and reference limits", () => {
    const board = chain();
    const body = "这是用于回顾的完整知识内容。".repeat(200);
    for (let order = 1; order <= 60; order++) {
      board.nodes.push({
        ...board.nodes[5],
        id: `parallel-${order}`,
        title: `并行分支 ${order}`,
        body,
        order,
      });
    }
    const review = cardReview(board, ["card-5"]);
    expect(review.nodes).toHaveLength(69);
    expect(review.nodes.filter((n) => n.parentId === "card-4")).toHaveLength(
      61,
    );
    expect(review.nodes.at(-1)).toMatchObject({
      id: "parallel-60",
      level: 5,
      body,
    });
    expect(JSON.stringify(review).length).toBeGreaterThan(20_000);
    expect(
      contextBundleSchema.safeParse({
        topic: board.topic,
        references: [],
        summary: "",
        review,
      }).success,
    ).toBe(true);
  });

  it("merges multiple review windows without duplicate cards", () => {
    const review = cardReview(chain(), [
      "card-2",
      "card-8",
      "card-2",
      "missing",
    ]);
    expect(review.anchors).toEqual(["card-2", "card-8"]);
    expect(review.nodes).toHaveLength(11);
    expect(new Set(review.nodes.map((n) => n.id)).size).toBe(11);
  });

  it("uses the original question when broader or parallel roots are added", () => {
    let board = chain();
    board = addParent(board, "card-0", "broader-root", "一个更广泛的领域");
    board = addRoot(board, "broader-root", "peer-root", "一个局部联想");
    expect(board.topic).toBe("用户最初的问题");
    expect(cardReview(board).anchors).toEqual(["card-0"]);
    expect(cardReview(board, ["missing"]).anchors).toEqual(["card-0"]);
  });

  it("respects excluded bodies and diagrams without hiding the public structure", () => {
    const board = chain();
    board.nodes[5].visual = {
      kind: "parts",
      labels: ["私有图示一", "私有图示二"],
      basis: "literal",
    };
    const before = structuredClone(board);
    const review = cardReview(board, ["card-5"], ["node:card-5"]);
    expect(review.nodes.find((n) => n.id === "card-5")).toEqual({
      id: "card-5",
      parentId: "card-4",
      level: 5,
      order: 0,
      title: "第 5 层",
      body: "",
      bodyExcluded: true,
    });
    expect(JSON.stringify(review)).not.toContain("私有图示");
    expect(board).toEqual(before);
    expect(
      cardReview(board, ["card-5"]).nodes.find((n) => n.id === "card-5")
        ?.visual,
    ).toEqual(before.nodes[5].visual);
  });

  it("rejects review contents beyond the board limits at the IPC boundary", () => {
    const board = chain();
    const review = cardReview(board, ["card-5"]);
    const invalidCard = { ...review.nodes[0], body: "长".repeat(4_001) };
    expect(
      contextBundleSchema.safeParse({
        topic: board.topic,
        references: [],
        summary: "",
        review: { ...review, nodes: [invalidCard] },
      }).success,
    ).toBe(false);
  });
  it("scopes the review to the anchor's branch, not every card on its levels", () => {
    const board = chain();
    // A second branch under the question, as deep as the anchor.
    const base = board.nodes[1];
    board.nodes.push(
      {
        ...base,
        id: "other-1",
        parentId: "card-0",
        order: 1,
        title: "另一分支",
      },
      {
        ...base,
        id: "other-2",
        parentId: "other-1",
        order: 0,
        title: "另一分支第二层",
      },
      {
        ...base,
        id: "other-3",
        parentId: "other-2",
        order: 0,
        title: "另一分支第三层",
      },
    );
    const ids = cardReview(board, ["card-3"]).nodes.map((n) => n.id);
    expect(ids).toContain("card-2");
    expect(ids).toContain("card-0");
    expect(ids).toContain("other-1");
    expect(ids).not.toContain("other-2");
    expect(ids).not.toContain("other-3");
  });
});
