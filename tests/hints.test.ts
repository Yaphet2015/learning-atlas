import { describe, expect, it } from "vitest";
import type { Board, ConceptNode } from "../src/shared/types";
import {
  cachedHints,
  hintPrompt,
  hintSides,
  hintSignature,
  parseHints,
  withHints,
} from "../src/model/hints";
import { tutorInstructions } from "../electron/ai-runtime";
import { aiRequestSchema, boardSchema } from "../src/shared/validation";

const node = (
  id: string,
  title: string,
  parentId: string | null,
  order: number,
): ConceptNode => ({
  id,
  kind: "concept",
  title,
  body: "",
  parentId,
  order,
  status: "unseen",
});
const board = (): Board => ({
  version: 3,
  id: "board-h",
  title: "彩虹",
  topic: "彩虹是怎么形成的？",
  kind: "ai",
  createdAt: "2026-10-18T08:00:00.000Z",
  updatedAt: "2026-10-18T08:00:00.000Z",
  nodes: [
    node("q", "彩虹是怎么形成的？", null, 0),
    node("a", "光的折射", "q", 0),
  ],
  relations: [],
  notes: [],
  scene: {
    width: 180,
    color: "#E9AE7E",
    prediction: "",
    explanation: "",
    changed: null,
  },
});

describe("AI ghost hints", () => {
  it("asks roots for three directions and other cards for two, in one prompt", () => {
    expect(hintSides({ parentId: null })).toEqual(["below", "right", "above"]);
    expect(hintSides({ parentId: "q" })).toEqual(["below", "right"]);
    expect(hintPrompt(board(), "q")).toMatch(/below.*right.*above/s);
    expect(hintPrompt(board(), "a")).not.toContain("above");
    expect(tutorInstructions("hint")).toContain(
      '{"below":"…","right":"…","above":"…"}',
    );
    expect(
      aiRequestSchema.safeParse({
        boardId: "board-h",
        stickyId: "hint-a",
        requestId: "r1",
        prompt: "x",
        mode: "hint",
        context: { topic: "t", references: [], summary: "" },
      }).success,
    ).toBe(true);
  });
  it("parses tolerant JSON, keeps only this card's directions, clips and drops duplicates", () => {
    const b = board();
    const text =
      '好的：```json\n{"below":"  白光里有几种颜色 ","right":"光的反射","above":"为什么天空是蓝的","extra":1}\n```';
    expect(parseHints(text, b, "a")).toEqual({
      sig: hintSignature(b, "a"),
      below: "白光里有几种颜色",
      right: "光的反射",
    });
    // An existing title is never suggested again; nothing usable → null.
    expect(parseHints('{"below":"光的折射"}', b, "q")).toBeNull();
    expect(parseHints("not json", b, "q")).toBeNull();
    const long = parseHints(`{"below":"${"长".repeat(30)}"}`, b, "q")!;
    expect([...long.below!]).toHaveLength(18);
  });
  it("caches on the card until the card's neighbourhood changes; boards with hints still validate", () => {
    const b = board();
    const hints = parseHints('{"below":"白光里有几种颜色"}', b, "a")!;
    const cached = withHints(b, "a", hints);
    expect(cachedHints(cached, "a")).toEqual(hints);
    expect(boardSchema.safeParse(cached).success).toBe(true);
    // A new child changes the signature: the hint is stale and will be asked for again.
    const grown = {
      ...cached,
      nodes: [...cached.nodes, node("c", "白光", "a", 0)],
    };
    expect(cachedHints(grown, "a")).toBeUndefined();
    // Renaming the card also invalidates.
    const renamed = {
      ...cached,
      nodes: cached.nodes.map((n) =>
        n.id === "a" ? { ...n, title: "折射" } : n,
      ),
    };
    expect(cachedHints(renamed, "a")).toBeUndefined();
  });

  it("invalidates hints after topic, parallel contents, or knowledge parents change", () => {
    const b = board();
    b.nodes.push(node("peer", "光的反射", "q", 1));
    const hints = parseHints('{"below":"白光里有几种颜色"}', b, "a")!;
    const cached = withHints(b, "a", hints);
    for (const changed of [
      { ...cached, topic: "光怎样形成颜色？" },
      {
        ...cached,
        nodes: cached.nodes.map((n) =>
          n.id === "peer" ? { ...n, body: "反射与折射的差异" } : n,
        ),
      },
      {
        ...cached,
        nodes: cached.nodes.map((n) =>
          n.id === "peer" ? { ...n, parentId: "a" } : n,
        ),
      },
    ]) {
      expect(cachedHints(changed, "a")).toBeUndefined();
    }
    // Saving the cache or changing mastery alone does not change knowledge contents.
    expect(
      cachedHints(
        {
          ...cached,
          nodes: cached.nodes.map((n) => ({ ...n, status: "exploring" })),
        },
        "a",
      ),
    ).toEqual(hints);
  });
});
