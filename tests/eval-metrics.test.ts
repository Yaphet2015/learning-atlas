import { describe, expect, it } from "vitest";
import { bigrams, jaccard, treeMetrics } from "../evals/metrics";

describe("eval metrics", () => {
  it("scores identical wording as similar and different wording as not", () => {
    expect(jaccard(bigrams("保费怎么算"), bigrams("保费怎么算"))).toBe(1);
    expect(jaccard(bigrams("保费怎么算"), bigrams("等待期多长"))).toBe(0);
  });
  it("finds near duplicates and new information per level", () => {
    const m = treeMetrics([
      { id: "r", parentId: null, title: "重疾险", body: "", level: 0 },
      {
        id: "a",
        parentId: "r",
        title: "保额怎么定",
        body: "按收入定保额",
        level: 1,
      },
      {
        id: "b",
        parentId: "r",
        title: "保额怎么定呢",
        body: "按收入定保额",
        level: 1,
      },
      {
        id: "c",
        parentId: "a",
        title: "保额怎么定",
        body: "按收入定保额",
        level: 2,
      },
      {
        id: "d",
        parentId: "a",
        title: "收入替代年限",
        body: "三到五年收入",
        level: 2,
      },
    ]);
    expect(m.nodes).toBe(4);
    expect(m.nearDuplicates.length).toBeGreaterThan(0);
    expect(m.newInfoRatio[2]).toBeLessThan(1);
  });
});
