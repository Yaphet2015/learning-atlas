import { describe, expect, it } from "vitest";
import type { Board, ConceptNode } from "../src/shared/types";
import { parseHints, withHints } from "../src/model/hints";
import { expandPrompt } from "../src/model/expand";
import { ANGLE_DEPTH, DIG_ANGLES, angleRule } from "../src/model/angles";
import { boardSchema } from "../src/shared/validation";

const node = (id: string, title: string, parentId: string | null, order: number): ConceptNode => ({
  id,
  kind: "concept",
  title,
  body: "",
  parentId,
  order,
  status: "unseen",
});
const board = (): Board => ({
  version: 2,
  id: "board-s",
  title: "彩虹",
  topic: "彩虹是怎么形成的？",
  kind: "ai",
  createdAt: "2026-10-18T08:00:00.000Z",
  updatedAt: "2026-10-18T08:00:00.000Z",
  nodes: [node("q", "彩虹是怎么形成的？", null, 0), { ...node("a", "光的折射", "q", 0), depthType: "what" }],
  relations: [],
  notes: [],
  scene: { width: 180, color: "#E9AE7E", prediction: "", explanation: "", changed: null },
});

describe("dig-which-way expand", () => {
  it("without an angle keeps the depth ladder", () => {
    const p = expandPrompt(board(), "a");
    expect(p).toContain("深度阶梯");
    expect(p).not.toContain("挖掘方向");
  });
  it.each(DIG_ANGLES)("angle %s replaces the ladder and pins depthType", (angle) => {
    const p = expandPrompt(board(), "a", angle);
    expect(p).not.toContain("深度阶梯");
    expect(p).toContain(angleRule(angle));
    expect(p).toContain(`"depthType" 写 "${ANGLE_DEPTH[angle]}"`.replace('"depthType"', "depthType"));
    expect(p).toContain("光的折射");
  });
  it("example maps to the apply depth", () => {
    expect(ANGLE_DEPTH.example).toBe("apply");
  });
});

describe("angle-labelled hints", () => {
  it("keeps valid angles and up to two extra distinct-angle child hints", () => {
    const b = board();
    const h = parseHints(
      JSON.stringify({
        below: "为什么会偏折",
        right: "光的反射",
        angles: { below: "why", right: "compare", above: "how" },
        more: [
          { angle: "why", text: "重复角度" },
          { angle: "example", text: "水杯里的筷子" },
          { angle: "bogus", text: "无效角度" },
          { angle: "edge", text: "光的折射" },
          { angle: "apply", text: "眼镜怎么矫正" },
          { angle: "how", text: "第三条不要" },
        ],
      }),
      b,
      "a",
    )!;
    expect(h.angles).toEqual({ below: "why", right: "compare" });
    expect(h.more).toEqual([
      { angle: "example", text: "水杯里的筷子" },
      { angle: "apply", text: "眼镜怎么矫正" },
    ]);
    expect(() => boardSchema.parse(withHints(b, "a", h))).not.toThrow();
  });
  it("still accepts plain hints without angles", () => {
    const h = parseHints('{"below":"为什么会偏折"}', board(), "a")!;
    expect(h.angles).toBeUndefined();
    expect(h.more).toBeUndefined();
  });
});

import { coverTarget } from "../src/model/plan";
describe("coverage: generating a missing plan block", () => {
  const planned = (): Board => {
    const b = board();
    b.nodes[1] = { ...b.nodes[1], planBlock: "p1" };
    b.plan = {
      status: "confirmed",
      intent: "mechanism",
      goal: "学完后，能解释彩虹",
      learner: "按初学者处理",
      blocks: [
        { id: "p1", title: "折射", why: "光要先弯折", parent: null, prerequisites: [], core: true },
        { id: "p1a", title: "色散", why: "颜色分开", parent: "p1", prerequisites: ["p1"], core: true },
        { id: "p2", title: "观察角度", why: "", parent: null, prerequisites: [], core: false },
      ],
      outOfScope: [],
    };
    return b;
  };
  it("grows a sub-block under its parent block's card", () => {
    const t = coverTarget(planned(), "p1a")!;
    expect(t.anchorId).toBe("a");
    expect(t.prompt).toContain('block 写 "p1a"');
    expect(t.prompt).toContain("「折射」");
  });
  it("grows a missing top block from the root, and nothing for covered blocks", () => {
    expect(coverTarget(planned(), "p2")!.anchorId).toBe("q");
    expect(coverTarget(planned(), "p1")).toBeUndefined();
    expect(coverTarget(planned(), "nope")).toBeUndefined();
  });
});
