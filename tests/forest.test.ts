import { describe, expect, it } from "vitest";
import type { Board, ConceptNode } from "../src/shared/types";
import {
  GAP_FOREST,
  ROOT_W,
  layoutTree,
  sectionNumbers,
} from "../src/model/layout";
import { addParent, addRoot, removeSelection } from "../src/model/editor";
import { serializeStructure } from "../src/model/structure";
import { isQuestionRoot, rootOf, rootsOf } from "../src/model/kickoff";
import { boardSchema, parseBoard } from "../src/shared/validation";
import { listSessions } from "../src/model/sessions";
import { newNote } from "../src/model/boards";

const T = "2026-10-18T08:00:00.000Z";
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
function board(nodes: ConceptNode[]): Board {
  return {
    version: 2,
    id: "board-f",
    title: "彩虹",
    topic: "彩虹是怎么形成的？",
    kind: "ai",
    createdAt: T,
    updatedAt: T,
    nodes,
    relations: [],
    notes: [],
    scene: {
      width: 180,
      color: "#E9AE7E",
      prediction: "",
      explanation: "",
      changed: null,
    },
  };
}
const single = () =>
  board([
    node("topic_q", "彩虹是怎么形成的？", null, 0),
    node("a", "光的折射", "topic_q", 0),
    node("b", "阳光里有哪些颜色", "topic_q", 1),
  ]);

describe("root grows upward", () => {
  it("puts a broader parent above the root; the old root becomes its first child", () => {
    const next = addParent(single(), "topic_q", "root_up");
    expect(boardSchema.safeParse(next).success).toBe(true);
    expect(rootOf(next)?.id).toBe("root_up");
    expect(next.nodes.find((n) => n.id === "topic_q")).toMatchObject({
      parentId: "root_up",
      order: 0,
    });
    expect(next.nodes.find((n) => n.id === "a")?.parentId).toBe("topic_q");
    const numbers = sectionNumbers(next.nodes);
    expect(numbers.get("topic_q")).toBe("§1");
    expect(numbers.get("b")).toBe("§1.2");
    const layout = layoutTree(next.nodes);
    expect(layout.positions.get("root_up")!.level).toBe(0);
    expect(layout.positions.get("topic_q")!.level).toBe(1);
    expect(layout.positions.get("a")!.level).toBe(2);
    // The new root shows its own title; the original question became a card.
    // The original question is marked; the new root shows its own title.
    expect(next.nodes.find((n) => n.id === "topic_q")?.question).toBe(true);
    expect(
      isQuestionRoot(next.nodes, next.nodes.find((n) => n.id === "root_up")!),
    ).toBe(false);
    expect(addParent(next, "a", "x")).toBe(next); // only roots grow upward
  });
});

describe("roots side by side (a forest)", () => {
  const forest = () => {
    const one = addRoot(single(), "topic_q", "root_side");
    return {
      ...one,
      nodes: [...one.nodes, node("c", "云和雨", "root_side", 0)],
    };
  };
  it("adds a root after the current one and keeps the first tree's layout and numbers", () => {
    const before = layoutTree(single().nodes);
    const b = forest();
    expect(boardSchema.safeParse(b).success).toBe(true);
    expect(rootsOf(b.nodes).map((n) => n.id)).toEqual(["topic_q", "root_side"]);
    const layout = layoutTree(b.nodes);
    expect(layout.rootIds).toEqual(["topic_q", "root_side"]);
    for (const id of ["topic_q", "a", "b"])
      expect(layout.positions.get(id)).toEqual(before.positions.get(id));
    const first = Math.max(
      ...["topic_q", "a", "b"].map((id) => {
        const p = layout.positions.get(id)!;
        return p.x + p.w;
      }),
    );
    const side = layout.positions.get("root_side")!;
    expect(side.level).toBe(0);
    expect(side.w).toBe(ROOT_W);
    expect(side.y).toBe(layout.positions.get("topic_q")!.y);
    expect(side.x).toBeGreaterThanOrEqual(first + GAP_FOREST - 1);
    expect(layout.positions.get("c")!.y).toBe(layout.positions.get("a")!.y);
    const numbers = sectionNumbers(b.nodes);
    expect(numbers.get("topic_q")).toBeUndefined();
    expect(numbers.get("a")).toBe("§1");
    expect(numbers.get("root_side")).toBe("§B");
    expect(numbers.get("c")).toBe("§B1");
  });
  it("inserts between roots and renumbers the later ones", () => {
    const b = addRoot(forest(), "topic_q", "root_mid");
    expect(rootsOf(b.nodes).map((n) => n.id)).toEqual([
      "topic_q",
      "root_mid",
      "root_side",
    ]);
    expect(sectionNumbers(b.nodes).get("c")).toBe("§C1");
  });
  it("serializes every root as an L0 line, in order", () => {
    const text = serializeStructure(forest(), { anchor: "c" });
    expect(text).toContain("L0 起点 彩虹是怎么形成的？");
    expect(text).toContain("§B L0 起点 新的起点问题");
    expect(text).toContain("  §B1 L1 云和雨");
    expect(text).toContain("2 个并列的起点");
    expect(text).toContain("路径：§B 起点 新的起点问题 › §B1 云和雨");
    expect(text.indexOf("L0 起点 彩虹")).toBeLessThan(text.indexOf("§B L0"));
    // A single-root board reads exactly as before.
    expect(serializeStructure(single())).not.toContain("并列的起点");
  });
  it("a root can be removed only while another remains; its children become roots", () => {
    const b = forest();
    const gone = removeSelection(b, { kind: "node", id: "root_side" });
    expect(rootsOf(gone.nodes).map((n) => n.id)).toEqual(["topic_q", "c"]);
    expect(boardSchema.safeParse(gone).success).toBe(true);
    const lone = single();
    expect(removeSelection(lone, { kind: "node", id: "topic_q" })).toBe(lone);
  });
  it("only the question root shows the topic, also after it is removed and a child is promoted", () => {
    const b = forest();
    const q = (nodes: ConceptNode[], id: string) =>
      isQuestionRoot(nodes, nodes.find((n) => n.id === id)!);
    expect(q(b.nodes, "topic_q")).toBe(true);
    expect(q(b.nodes, "root_side")).toBe(false);
    const gone = removeSelection(b, { kind: "node", id: "root_side" });
    expect(q(gone.nodes, "c")).toBe(false);
    // Older single-root boards have no flag: the root is the question.
    expect(q(single().nodes, "topic_q")).toBe(true);
  });
  it("labels conversations on a later root by its title", () => {
    const b = forest();
    b.notes = [newNote(b, { x: 0, y: 0 }, { kind: "node", id: "root_side" })];
    expect(listSessions(b)[0].anchorTitle).toBe("新的起点问题");
  });
});

describe("validation and older boards", () => {
  it("accepts one or several roots and rejects none", () => {
    expect(boardSchema.safeParse(single()).success).toBe(true);
    const none = single();
    none.nodes = none.nodes.map((n) =>
      n.parentId === null ? { ...n, parentId: "a" } : n,
    );
    expect(boardSchema.safeParse(none).success).toBe(false);
  });
  it("loads a saved forest board through the normal parse path", () => {
    const raw = JSON.parse(
      JSON.stringify(addRoot(single(), "topic_q", "root_side")),
    );
    const parsed = parseBoard(raw);
    expect(rootsOf(parsed.nodes)).toHaveLength(2);
  });
});
