import { describe, expect, it } from "vitest";
import { buildMapFromAI, createEmptyBoard } from "../src/model/boards";

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

describe("key-point dedupe", () => {
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
