import { describe, expect, it } from "vitest";
import { buildMapFromAI, createEmptyBoard } from "../src/model/boards";
import { expandPrompt, nextDepths } from "../src/model/expand";
import { boardSchema } from "../src/shared/validation";
import { tutorInstructions } from "../electron/prompts";

const rich = {
  id: "a",
  title: "费率差多少",
  summary: "指数基金每年便宜约 1 个百分点。",
  body: "主动基金管理费约 1.2–1.5%，指数基金约 0.15–0.5%。",
  keyPoints: ["管理费差约 1%", "30 年复利后差距约 25%"],
  whyItMatters: "成本是少数能确定的收益差。",
  example: "10 万元 30 年，年化 7% 与 6% 相差约 21 万。",
  misconception: "误解：费率差很小；其实：复利放大。",
  depthType: "why",
  sources: [{ title: "SPIVA", url: "https://www.spglobal.com/spdji/en/research-insights/spiva/" }],
};

describe("rich cards", () => {
  it("carries rich fields onto cards; old boards stay valid", () => {
    const board = createEmptyBoard("指数基金和主动基金哪个好");
    expect(boardSchema.safeParse(board).success).toBe(true);
    const next = buildMapFromAI(JSON.stringify({ nodes: [rich], relations: [] }), board);
    const card = next.nodes[1];
    expect(card.summary).toBe(rich.summary);
    expect(card.keyPoints).toEqual(rich.keyPoints);
    expect(card.depthType).toBe("why");
    expect(card.sources?.[0].url).toContain("spglobal");
    expect(boardSchema.parse(next).nodes[1].example).toBe(rich.example);
  });
  it("drops unsafe or invalid optional fields, trims long lists, keeps the card", () => {
    const board = createEmptyBoard("x");
    const next = buildMapFromAI(
      JSON.stringify({
        nodes: [
          {
            ...rich,
            sources: [{ title: "x", url: "javascript:alert(1)" }],
            keyPoints: ["1", "2", "3", "4", "5"],
            depthType: "deep",
            example: "<script>alert(1)</script>",
          },
        ],
        relations: [],
      }),
      board,
    );
    const card = next.nodes[1];
    expect(card.sources).toBeUndefined();
    expect(card.keyPoints).toEqual(["1", "2", "3", "4"]);
    expect(card.depthType).toBeUndefined();
    expect(card.example).toBeUndefined();
    expect(JSON.stringify(next)).not.toContain("script");
  });
  it("the near-duplicate filter reads keyPoints", () => {
    const board = buildMapFromAI(
      JSON.stringify({ nodes: [rich], relations: [] }),
      createEmptyBoard("指数基金和主动基金哪个好"),
    );
    const next = buildMapFromAI(
      JSON.stringify({
        nodes: [{ ...rich, id: "b", title: "成本差距", summary: rich.summary }],
        relations: [],
      }),
      board,
    );
    expect(next.nodes).toHaveLength(board.nodes.length);
  });
  it("expand prompt: ladder step and parent/sibling keyPoints as don't-repeat", () => {
    expect(nextDepths("what")).toEqual(["why", "how"]);
    expect(nextDepths("apply")).toEqual(["edge", "compare"]);
    const board = buildMapFromAI(
      JSON.stringify({
        nodes: [rich, { id: "s", title: "风险差异", body: "x", keyPoints: ["跟踪误差小"], depthType: "what" }],
        relations: [],
      }),
      createEmptyBoard("指数基金和主动基金哪个好"),
    );
    const anchor = board.nodes.find((n) => n.title === "费率差多少")!;
    const p = expandPrompt(board, anchor.id);
    expect(p).toContain("how（怎么做） 或 edge（边界）");
    expect(p).toContain("30 年复利后差距约 25%");
    expect(p).toContain("兄弟卡「风险差异」：跟踪误差小");
    expect(tutorInstructions("expand")).toContain("每张新卡片都必须带来新信息");
  });
});
