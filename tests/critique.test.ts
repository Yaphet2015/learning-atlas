import { describe, expect, it } from "vitest";
import { buildMapFromAI, createEmptyBoard } from "../src/model/boards";
import { applyCritique, critiquePrompt } from "../src/model/critique";
import { tutorInstructions, modeTemperature } from "../electron/prompts";

const base = () =>
  buildMapFromAI(
    JSON.stringify({
      nodes: [
        { id: "a", title: "学习路线", body: "x", summary: "先修→核心→进阶", keyPoints: ["每周 6 小时", "先补数学"] },
      ],
      relations: [],
    }),
    createEmptyBoard("如何学好微观经济学"),
  );
const grow = (b: ReturnType<typeof base>) => {
  const anchor = b.nodes[1].id;
  const next = buildMapFromAI(
    JSON.stringify({
      nodes: [
        { id: "n1", title: "供给曲线", body: "知识点", keyPoints: ["价格升供给增"] },
        { id: "n2", title: "做题方法", body: "y", keyPoints: ["每章做 20 道题"] },
        { id: "n3", title: "子", body: "z", parent: "n1" },
      ],
      relations: [{ source: "n1", target: "n2", label: "对照" }],
    }),
    b,
    anchor,
    "expand",
  );
  const ids = next.nodes.slice(b.nodes.length).map((n) => n.id);
  return { next, anchor, ids };
};

describe("critique pass", () => {
  it("prompt lists the new cards and the existing points", () => {
    const { next, anchor, ids } = grow(base());
    const p = critiquePrompt(next, anchor, ids);
    expect(p).toContain("供给曲线");
    expect(p).toContain("每周 6 小时");
    expect(tutorInstructions("critique")).toContain("快速审稿");
    expect(modeTemperature("critique")).toBe(0.2);
  });
  it("drops a card with its new children, revises another, renumbers order", () => {
    const { next, ids } = grow(base());
    const [n1, n2] = ids;
    const r = applyCritique(
      JSON.stringify({
        cards: [
          { id: n1, action: "drop", reason: "学科知识而非学法" },
          { id: n2, action: "revise", summary: "每章配 20 道题自测", keyPoints: ["错题第二天重做"] },
        ],
      }),
      next,
      ids,
      next,
    );
    expect(r.dropped.sort()).toEqual([n1, ids[2]].sort());
    const card = r.board.nodes.find((n) => n.id === n2)!;
    expect(card.summary).toBe("每章配 20 道题自测");
    expect(card.order).toBe(0);
    expect(r.board.relations).toHaveLength(0);
  });
  it("leaves learner-edited cards, malformed replies and an all-drop batch safe", () => {
    const { next, ids } = grow(base());
    const edited = {
      ...next,
      nodes: next.nodes.map((n) => (n.id === ids[0] ? { ...n, title: "我改过" } : n)),
    };
    const drop = JSON.stringify({ cards: ids.map((id) => ({ id, action: "drop" })) });
    const r = applyCritique(drop, edited, ids, next);
    expect(r.board.nodes.some((n) => n.id === ids[0])).toBe(true);
    expect(applyCritique("不是 JSON", next, ids).board).toBe(next);
    const all = applyCritique(drop, next, ids, next);
    expect(all.board.nodes.some((n) => n.id === ids[0])).toBe(true);
  });
  it("code-level dedupe drops a card whose key points are all already on the board", () => {
    const b = base();
    const next = buildMapFromAI(
      JSON.stringify({
        nodes: [
          { id: "d", title: "时间安排", body: "安排", keyPoints: ["每周 6 小时"] },
          { id: "e", title: "数学准备", body: "准备", keyPoints: ["先补数学", "学会求导"] },
        ],
        relations: [],
      }),
      b,
    );
    const added = next.nodes.slice(b.nodes.length);
    expect(added.map((n) => n.title)).toEqual(["数学准备"]);
    expect(added[0].keyPoints).toEqual(["学会求导"]);
  });
});
