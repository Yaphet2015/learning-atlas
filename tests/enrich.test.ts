import { describe, expect, it } from "vitest";
import { tutorInstructions } from "../electron/prompts";
import { createEmptyBoard } from "../src/model/boards";
import { applyEnrichment, enrichPrompt } from "../src/model/enrich";
import type { Board } from "../src/shared/types";

const board = (): Board => {
  const b = createEmptyBoard("彩虹");
  const root = b.nodes[0];
  return {
    ...b,
    nodes: [
      ...b.nodes,
      {
        ...root,
        id: "c1",
        parentId: root.id,
        order: 0,
        title: "折射",
        body: "光进入水滴时偏折",
      },
      {
        ...root,
        id: "c2",
        parentId: root.id,
        order: 1,
        title: "色散",
        body: "不同颜色偏折不同",
      },
    ],
  };
};

describe("enrich follow-up", () => {
  it("keeps diagrams and overviews out of the generation prompts", () => {
    for (const mode of ["map", "expand"] as const) {
      expect(tutorInstructions(mode)).not.toContain("visual 对象");
      expect(tutorInstructions(mode)).not.toContain("overviews");
    }
    expect(tutorInstructions("enrich")).toContain("visuals");
    expect(tutorInstructions("enrich")).toContain("overviews");
  });
  it("lists the new cards in the prompt", () => {
    expect(enrichPrompt(board(), ["c1"])).toContain(
      "[id:c1] 折射：光进入水滴时偏折",
    );
  });
  it("adds diagrams only to the listed new cards", () => {
    const visual = {
      kind: "process",
      labels: ["入射", "偏折"],
      basis: "literal",
    };
    const next = applyEnrichment(
      JSON.stringify({
        visuals: [
          { id: "c1", visual },
          { id: "c2", visual },
        ],
      }),
      board(),
      ["c1"],
    );
    expect(next.nodes.find((n) => n.id === "c1")?.visual?.labels).toEqual([
      "入射",
      "偏折",
    ]);
    expect(next.nodes.find((n) => n.id === "c2")?.visual).toBeUndefined();
  });
  it("ignores malformed replies", () => {
    const b = board();
    expect(applyEnrichment("not json", b, ["c1"])).toBe(b);
  });
});
