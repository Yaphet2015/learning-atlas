import { describe, expect, it } from "vitest";
import type { Board, ConceptNode, LadderLevel, ProbeVerdict } from "../src/shared/types";
import {
  answerProbe,
  applyFrontier,
  failRecheck,
  levelState,
  localGrade,
  newProbe,
  nextProbe,
  parseGrade,
  parseLadder,
  probeResult,
  skipProbe,
} from "../src/model/probe";
import { afterChildSealed, isStuck, parseAnalogy, putOff } from "../src/model/stuck";
import { parseWrap, sentences } from "../src/model/wrap";
import { nextStep } from "../src/model/next-step";
import { boardSchema } from "../src/shared/validation";

const node = (id: string, title: string, parentId: string | null, order: number, extra: Partial<ConceptNode> = {}): ConceptNode => ({
  id,
  kind: "concept",
  title,
  body: "",
  parentId,
  order,
  status: "unseen",
  ...extra,
});
const board = (nodes: ConceptNode[], extra: Partial<Board> = {}): Board => ({
  version: 2,
  id: "board-p2",
  title: "重疾险",
  topic: "重疾险有哪些重要条款？",
  kind: "ai",
  createdAt: "2026-10-22T08:00:00.000Z",
  updatedAt: "2026-10-22T08:00:00.000Z",
  nodes,
  relations: [],
  notes: [],
  scene: { width: 180, color: "#E9AE7E", prediction: "", explanation: "", changed: null },
  ...extra,
});
const ladder = (n = 6): LadderLevel[] =>
  Array.from({ length: n }, (_, i) => ({
    level: i,
    desc: `第${i}级`,
    keyPoints: [`要点${i}`],
    probe: i === 2 ? { type: "choice", q: "小李投保第 2 个月确诊，卡在哪？", options: ["疾病定义", "等待期", "免责条款"], answer: 1 } : { type: "explain", q: `一句话：第${i}级？` },
  }));
/** Answer the probe with a fixed truth: levels below `known` are correct. */
const run = (known: number, n = 6, override: Partial<Record<number, ProbeVerdict>> = {}) => {
  let s = newProbe(ladder(n));
  const asked: number[] = [];
  for (let guard = 0; s.status === "asking" && guard < 10; guard++) {
    const step = nextProbe(s);
    if (step.done) break;
    asked.push(step.level);
    const verdict = override[step.level] ?? (step.level < known ? "correct" : "wrong");
    delete override[step.level];
    s = answerProbe(s, { level: step.level, verdict, ...(step.recheck ? { recheck: true } : {}) });
  }
  return { s, asked };
};

describe("bisection 摸底", () => {
  it("starts at L3 and converges in about 3 questions (spec example: L3 ✗ → L1 ✓ → L2 ✓ → frontier L3)", () => {
    const { s, asked } = run(3);
    expect(asked).toEqual([3, 1, 2]);
    expect(s).toMatchObject({ status: "done", frontier: 3 });
    expect(levelState(s, 0)).toBe("inferred");
    expect(levelState(s, 3)).toBe("wrong");
    expect(levelState(s, 5)).toBe("unasked");
  });
  it("finds every frontier 0–6 within 3 questions on a 6-level ladder", () => {
    for (let f = 0; f <= 6; f++) {
      const { s, asked } = run(f);
      expect(s.frontier).toBe(f);
      expect(asked.length).toBeLessThanOrEqual(3);
    }
  });
  it("works on 4–6 levels", () => {
    for (const n of [4, 5])
      for (let f = 0; f <= n; f++) expect(run(f, n).s.frontier).toBe(f);
  });
  it("a non-monotonic answer gets one recheck (the 4th question), and the recheck decides", () => {
    let s = newProbe(ladder());
    s = answerProbe(s, { level: 1, verdict: "wrong" });
    s = answerProbe(s, { level: 4, verdict: "correct" });
    const step = nextProbe(s);
    expect(step).toEqual({ done: false, level: 1, recheck: true });
    // The recheck says L1 is known after all: L4 counts, bisection carries on between L4 and L6.
    const ok = answerProbe(s, { level: 1, verdict: "correct", recheck: true });
    expect(nextProbe(ok)).toEqual({ done: false, level: 5, recheck: false });
    // The recheck confirms L1 is not known: L4 is discounted; only L0 is left to ask.
    const no = answerProbe(s, { level: 1, verdict: "wrong", recheck: true });
    expect(nextProbe(no)).toEqual({ done: false, level: 0, recheck: false });
    expect(answerProbe(no, { level: 0, verdict: "correct" })).toMatchObject({ status: "done", frontier: 1, answers: { length: 4 } });
  });
  it("two 不知道 in a row stop the probe at the shallower level", () => {
    let s = newProbe(ladder());
    s = answerProbe(s, { level: 3, verdict: "unsure" });
    s = answerProbe(s, { level: 1, verdict: "unsure" });
    expect(s).toMatchObject({ status: "done", frontier: 0 });
  });
  it("partial counts as not mastered", () => {
    expect(run(6, 6, { 3: "partial" }).s.frontier).toBe(3);
  });
  it("never asks more than 4", () => {
    let s = newProbe(ladder());
    const seq: ProbeVerdict[] = ["correct", "wrong", "correct", "wrong", "correct", "wrong"];
    let i = 0;
    while (s.status === "asking") {
      const step = nextProbe(s);
      if (step.done) break;
      s = answerProbe(s, { level: step.level, verdict: seq[i++], ...(step.recheck ? { recheck: true } : {}) });
    }
    expect(s.answers.length).toBeLessThanOrEqual(4);
  });
  it("skip = frontier 0, with the reassuring copy", () => {
    const s = skipProbe(newProbe(ladder()));
    expect(s).toMatchObject({ status: "skipped", frontier: 0 });
    expect(probeResult(s, 4)).toContain("跳过也没关系");
    expect(probeResult({ ...run(6).s }, 4)).toContain("你已经很熟了");
    expect(probeResult(run(3).s, 3)).toBe("你已经懂「第2级」了。所以我们从「第3级」开始，共 3 站。");
  });
  it("grades choices locally (不知道 / wrong option / right option without reason) with no call", () => {
    const l = ladder()[2];
    expect(localGrade(l, -1, "")).toBe("unsure");
    expect(localGrade(l, 0, "因为")).toBe("wrong");
    expect(localGrade(l, 1, "")).toBe("correct");
    expect(localGrade(l, 1, "等待期内确诊不赔")).toBeNull();
    expect(localGrade(ladder()[3], null, "因为定义")).toBeNull();
    expect(parseGrade('{"verdict":"partial","missing":"等待期"}')).toEqual({ verdict: "partial", missing: "等待期" });
    expect(parseGrade('{"verdict":"maybe"}')).toBeNull();
  });
  it("parses a ladder, renumbers it, and rejects fewer than 4 levels", () => {
    const reply = JSON.stringify({
      ladder: [5, 0, 1, 2].map((level) => ({
        level,
        desc: `L${level}`,
        keyPoints: ["k"],
        probe: level === 2 ? { type: "choice", q: "q?", options: ["a", "b", "c"], answer: 2 } : { type: "explain", q: "q?" },
      })),
    });
    const l = parseLadder("好的：" + reply)!;
    expect(l.map((x) => [x.level, x.desc])).toEqual([[0, "L0"], [1, "L1"], [2, "L2"], [3, "L5"]]);
    expect(l[2].probe).toMatchObject({ type: "choice", answer: 2 });
    expect(parseLadder(JSON.stringify({ ladder: [{ desc: "a", probe: { q: "?" } }] }))).toBeNull();
  });
});

describe("frontier on the route", () => {
  const routed = (frontier: number) => {
    const b = board(
      [
        node("q", "起点", null, 0, { question: true }),
        node("a", "保什么", "q", 0, { meta: { level: 0 } }),
        node("b", "给付型", "q", 1, { meta: { level: 1 } }),
        node("c", "条款细读", "q", 2, { meta: { level: 3 } }),
        node("d", "取舍", "q", 3, { meta: { level: 4 }, status: "explained", seal: "test" }),
      ],
      { route: ["a", "b", "c", "d"], probe: { ...newProbe(ladder()), status: "done", frontier } },
    );
    return applyFrontier(b);
  };
  it("stations below the frontier get the light seal; the first one from the frontier is next", () => {
    const b = routed(3);
    expect(b.nodes.filter((n) => n.seal === "probe").map((n) => n.id)).toEqual(["a", "b"]);
    expect(nextStep(b)).toMatchObject({ kind: "station", station: 3 });
    expect(boardSchema.parse(b)).toBeTruthy();
  });
  it("re-probing recomputes light seals and never touches seals earned by 测", () => {
    const b = applyFrontier({ ...routed(3), probe: { ...newProbe(ladder()), status: "done", frontier: 1 } });
    expect(b.nodes.find((n) => n.id === "b")!.seal).toBeUndefined();
    expect(b.nodes.find((n) => n.id === "a")!.seal).toBe("probe");
    expect(b.nodes.find((n) => n.id === "d")!.seal).toBe("test");
    const all = applyFrontier({ ...b, probe: { ...b.probe!, frontier: 6 } });
    expect(all.nodes.find((n) => n.id === "d")!.seal).toBe("test");
  });
  it("cards with no level are spread over the ladder by route position", () => {
    const b = board(
      [node("q", "起点", null, 0, { question: true }), ...["a", "b", "c", "d"].map((id, i) => node(id, id, "q", i))],
      { route: ["a", "b", "c", "d"], probe: { ...newProbe(ladder()), status: "done", frontier: 2 } },
    );
    expect(applyFrontier(b).nodes.filter((n) => n.seal === "probe").map((n) => n.id)).toEqual(["a"]);
  });
  it("a light-sealed card that fails its recheck loses the seal and is queued after the current stop", () => {
    const b = failRecheck(routed(3), "a", "c");
    expect(b.nodes.find((n) => n.id === "a")).toMatchObject({ status: "exploring", beat: "learn" });
    expect(b.nodes.find((n) => n.id === "a")!.seal).toBeUndefined();
    expect(b.route).toEqual(["b", "c", "a", "d"]);
  });
  it("an unfinished probe is the next step", () => {
    const b = board([node("q", "起点", null, 0, { question: true })], { probe: newProbe(ladder()) });
    expect(nextStep(b).kind).toBe("probe");
  });
});

describe("stuck exits", () => {
  const stuck = () =>
    board(
      [
        node("q", "起点", null, 0, { question: true }),
        node("a", "等待期", "q", 0, { status: "exploring", beat: "test", fails: 2 }),
        node("b", "赔多少", "q", 1),
      ],
      { route: ["a", "b"] },
    );
  it("two wrong answers make a stop stuck", () => {
    expect(isStuck(stuck().nodes[1])).toBe(true);
    expect(isStuck({ ...stuck().nodes[1], fails: 1 })).toBe(false);
  });
  it("往下拆: split children come first, then the parent is tested again with a clean slate", () => {
    let b = stuck();
    b.nodes.push(node("a1", "观察期", "a", 0, { meta: { split: true } }), node("a2", "带病投保", "a", 1, { meta: { split: true } }));
    expect(nextStep(b)).toMatchObject({ kind: "child", card: { id: "a1" }, station: 1 });
    b = { ...b, nodes: b.nodes.map((n) => (n.id === "a1" ? { ...n, status: "explained" as const, seal: "test" as const } : n)) };
    expect(afterChildSealed(b, "a1").nodes.find((n) => n.id === "a")!.fails).toBe(2);
    b = { ...b, nodes: b.nodes.map((n) => (n.id === "a2" ? { ...n, status: "explained" as const, seal: "test" as const } : n)) };
    b = afterChildSealed(b, "a2");
    expect(b.nodes.find((n) => n.id === "a")).toMatchObject({ fails: 0, beat: "test" });
    const s = nextStep(b);
    expect(s).toMatchObject({ kind: "continue", card: { id: "a" }, beat: "test" });
    expect("why" in s && s.why).toContain("回到这一站重新测");
  });
  it("稍后: back to 探索中, moved to the end; the next step moves on", () => {
    const b = putOff(stuck(), "a");
    expect(b.route).toEqual(["b", "a"]);
    expect(b.nodes.find((n) => n.id === "a")).toMatchObject({ status: "exploring", fails: 0, meta: { later: true } });
    expect(nextStep(b)).toMatchObject({ kind: "station", card: { id: "b" } });
    expect(boardSchema.parse(b)).toBeTruthy();
  });
  it("换个类比 parses one short JSON reply", () => {
    expect(parseAnalogy('{"analogy":"像新办的健身卡有冷静期。"}')).toBe("像新办的健身卡有冷静期。");
    expect(parseAnalogy("nope")).toBeNull();
  });
});

describe("合起来讲", () => {
  const sealed = () =>
    board(
      [
        node("q", "起点", null, 0, { question: true }),
        ...["a", "b", "c"].map((id, i) => node(id, id, "q", i, { status: "explained", seal: "test" })),
      ],
      { route: ["a", "b", "c"] },
    );
  it("maps the lit stations back to card ids and drops unknown ones", () => {
    expect(parseWrap(sealed(), '{"lit":["s1","s3","s9"],"pass":true,"missing":""}')).toEqual({ lit: ["a", "c"], pass: true, missing: "" });
    expect(parseWrap(sealed(), "{}")).toBeNull();
  });
  it("wrap → wrapped once it passes", () => {
    const b = sealed();
    expect(nextStep(b).kind).toBe("wrap");
    const done = { ...b, wrap: { text: "…", lit: ["a"], done: true } };
    expect(nextStep(done).kind).toBe("wrapped");
    expect(boardSchema.parse(done)).toBeTruthy();
  });
  it("counts sentences", () => {
    expect(sentences("先看保哪些病。再看保额够不够！最后看保到几岁")).toBe(3);
  });
});
