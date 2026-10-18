import { describe, expect, it } from "vitest";
import type { Board, ConceptNode } from "../src/shared/types";
import { serializeStructure } from "../src/model/structure";
import { contextForNote } from "../src/model/context";
import { newNote } from "../src/model/boards";
import { boardSchema } from "../src/shared/validation";

const T = "2026-10-18T08:00:00.000Z";
const node = (
  id: string,
  title: string,
  parentId: string | null,
  order: number,
  status: ConceptNode["status"] = "unseen",
): ConceptNode => ({
  id,
  kind: "concept",
  title,
  body: `${title}的说明`,
  parentId,
  order,
  status,
});

function board(extra: ConceptNode[] = []): Board {
  return {
    version: 2,
    id: "board-s",
    title: "重疾险",
    topic: "重疾险有哪些重要条款",
    kind: "ai",
    createdAt: T,
    updatedAt: T,
    nodes: [
      node("root", "重疾险", null, 0, "exploring"),
      node("what", "保什么", "root", 0, "exploring"),
      node("when", "什么时候不赔", "root", 1),
      node("how", "怎么赔", "root", 2, "explained"),
      node("tiers", "重疾中症轻症", "what", 0, "explained"),
      node("wait", "等待期", "when", 0),
      node("wait-len", "等待期多长", "wait", 0),
      ...extra,
    ],
    relations: [
      {
        id: "r1",
        source: "tiers",
        target: "how",
        label: "对照",
        kind: "cross",
      },
    ],
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

describe("serializeStructure", () => {
  it("writes the tree as an indented outline with §, level, mastery and order", () => {
    const text = serializeStructure(board(), { anchor: "when" });
    const lines = text.split("\n");
    expect(lines).toContain("L0 起点 重疾险有哪些重要条款 [探索中] [id:root]");
    expect(lines).toContain("  §1 L1 保什么 [探索中] [id:what]");
    expect(lines).toContain("    §1.1 L2 重疾中症轻症 [我能解释] [id:tiers]");
    expect(lines).toContain(
      "  §2 L1 什么时候不赔 [待探索] ◀ 当前卡片 [id:when]",
    );
    expect(lines).toContain(
      "      §2.1.1 L3 等待期多长 [待探索] [id:wait-len]",
    );
    // Siblings keep their left-to-right order.
    expect(text.indexOf("§1 L1")).toBeLessThan(text.indexOf("§2 L1"));
    expect(text.indexOf("§2 L1")).toBeLessThan(text.indexOf("§3 L1"));
    // Explains that one level means parallel sub-questions.
    expect(text).toContain("同一层 L 号相同的卡片是并列的子问题");
    expect(text).toContain("跨枝连线：\n- §1.1 重疾中症轻症 —对照→ §3 怎么赔");
    expect(text).toContain("路径：起点问题 › §2 什么时候不赔");
    expect(text).toContain("同层兄弟（按顺序）：§1 保什么、§3 怎么赔");
    expect(text).toContain("子卡片（按顺序）：§2.1 等待期");
    expect(text).toContain("知识父节点：起点 重疾险有哪些重要条款 [id:root]");
  });

  it("marks extra selected cards and works without any anchor", () => {
    const text = serializeStructure(board(), {
      anchor: "when",
      cards: ["how", "nope"],
    });
    expect(text).toContain("§3 L1 怎么赔 [我能解释] ◀ 已选入");
    expect(text).toContain("已选入的卡片：§3 怎么赔");
    const free = serializeStructure(board());
    expect(free).not.toContain("◀");
    expect(free).toContain("§2.1 L2 等待期");
  });

  it("collapses distant branches on a big board and stays within the budget", () => {
    const many: ConceptNode[] = [];
    for (let i = 0; i < 40; i++) {
      many.push(node(`b${i}`, `远处的分支第${i}张卡片标题`, "how", i));
      for (let j = 0; j < 3; j++)
        many.push(node(`b${i}-${j}`, `更远的细节${i}-${j}`, `b${i}`, j));
    }
    const text = serializeStructure(board(many), { anchor: "wait" }, 2_000);
    expect(text.length).toBeLessThanOrEqual(2_000);
    expect(text).toContain("◀ 当前卡片");
    expect(text).toContain("路径：起点问题 › §2 什么时候不赔 › §2.1 等待期");
    expect(text).toContain("知识父节点：§2 什么时候不赔 [id:when]");
    expect(text).toMatch(/已折叠/);
    expect(text).not.toContain("更远的细节39-2");
  });

  it("is part of the context a note sends, and the bundle stays valid", () => {
    const b = board();
    const note = newNote(b, { x: 0, y: 0 }, { kind: "node", id: "when" });
    b.notes.push(note);
    expect(boardSchema.parse(b)).toBeTruthy();
    const context = contextForNote(b, note.id);
    expect(context.structure).toContain(
      "§2 L1 什么时候不赔 [待探索] ◀ 当前卡片",
    );
    // A free note still sees the map, anchored on the selected card if any.
    const free = newNote(b, { x: 0, y: 0 });
    b.notes.push(free);
    expect(
      contextForNote(b, free.id, { kind: "node", id: "how" }).structure,
    ).toContain("§3 L1 怎么赔 [我能解释] ◀ 当前卡片");
  });
});
