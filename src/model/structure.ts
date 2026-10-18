import type { Board, ConceptNode } from "../shared/types";
import { sectionNumbers } from "./layout";
import { isQuestionRoot } from "./kickoff";

/** Characters the outline may take in a request (CJK ≈ one token per character). */
export const STRUCTURE_BUDGET = 3_500;

const STATUS: Record<ConceptNode["status"], string> = {
  unseen: "待探索",
  exploring: "探索中",
  explained: "我能解释",
};
const clip = (s: string, n: number) =>
  s.length <= n ? s : `${s.slice(0, n - 1)}…`;

/**
 * A compact, readable view of the whole board for the tutor: the tree as an
 * indented outline (§ number, level, mastery), cross-links, and, for the cards
 * this conversation is about, their path from the root, siblings and children.
 * Siblings are listed in order (left to right on the canvas). Distant branches
 * are collapsed when the board does not fit the budget.
 */
export function serializeStructure(
  board: Board,
  focus: { anchor?: string | null; cards?: string[] } = {},
  budget = STRUCTURE_BUDGET,
): string {
  const byId = new Map(board.nodes.map((n) => [n.id, n]));
  const kids = new Map<string | null, ConceptNode[]>();
  for (const n of board.nodes)
    kids.set(n.parentId, [...(kids.get(n.parentId) ?? []), n]);
  for (const list of kids.values()) list.sort((a, b) => a.order - b.order);
  const roots = kids.get(null) ?? [];
  const root = roots[0];
  if (!root) return "";
  const no = sectionNumbers(board.nodes);
  const depth = new Map<string, number>();
  const walk = (n: ConceptNode, d: number) => {
    depth.set(n.id, d);
    for (const k of kids.get(n.id) ?? []) walk(k, d + 1);
  };
  for (const r of roots) walk(r, 0);
  const anchor = focus.anchor && byId.has(focus.anchor) ? focus.anchor : null;
  const picked = (focus.cards ?? []).filter(
    (id) => byId.has(id) && id !== anchor,
  );
  // The original question shows the board's topic; roots added later show their own title.
  const rootText = (n: ConceptNode, max: number) =>
    clip(
      isQuestionRoot(board.nodes, n) ? board.topic || n.title : n.title,
      max,
    );
  const label = (n: ConceptNode) =>
    n.parentId
      ? `${no.get(n.id) ?? ""} ${clip(n.title, 40)}`
      : `${no.get(n.id) ? `${no.get(n.id)} ` : ""}起点 ${rootText(n, 40)}`;
  const rootName = (n: ConceptNode) =>
    n.id === root.id && roots.length === 1 ? "起点问题" : label(n);
  const tag = (n: ConceptNode) =>
    n.id === anchor ? " ◀ 当前卡片" : picked.includes(n.id) ? " ◀ 已选入" : "";
  function line(n: ConceptNode): string {
    const section = no.get(n.id) ?? "";
    let heading: string;
    if (n.parentId) {
      const indent = "  ".repeat(depth.get(n.id) ?? 0);
      heading = `${indent}${section} L${depth.get(n.id)} ${clip(n.title, 40)}`;
    } else {
      const prefix = section ? `${section} ` : "";
      heading = `${prefix}L0 起点 ${rootText(n, 80)}`;
    }
    return `${heading} [${STATUS[n.status]}]${tag(n)} [id:${n.id}]`;
  }

  // Cards that are always written out: the path to every focus card, the focus
  // cards, their siblings and children, and the whole first level.
  const focusIds = [anchor, ...picked].filter(Boolean) as string[];
  const keep = new Set<string>();
  for (const r of roots) {
    keep.add(r.id);
    for (const k of kids.get(r.id) ?? []) keep.add(k.id);
  }
  for (const id of focusIds) {
    for (
      let c = byId.get(id);
      c;
      c = c.parentId ? byId.get(c.parentId) : undefined
    )
      keep.add(c.id);
    const self = byId.get(id)!;
    for (const s of kids.get(self.parentId) ?? []) keep.add(s.id);
    for (const k of kids.get(id) ?? []) {
      keep.add(k.id);
      for (const g of kids.get(k.id) ?? []) keep.add(g.id);
    }
  }
  const count = (n: ConceptNode): number =>
    (kids.get(n.id) ?? []).reduce((s, k) => s + 1 + count(k), 0);
  const outline = (full: boolean) => {
    const out: string[] = [];
    let hidden = 0;
    const emit = (n: ConceptNode) => {
      out.push(line(n));
      const children = kids.get(n.id) ?? [];
      const shown = full ? children : children.filter((k) => keep.has(k.id));
      for (const k of shown) emit(k);
      const rest = children.filter((k) => !shown.includes(k));
      if (rest.length) {
        const total = rest.reduce((s, k) => s + 1 + count(k), 0);
        hidden += total;
        out.push(
          `${"  ".repeat((depth.get(n.id) ?? 0) + 1)}…（此处另有 ${total} 张卡未列出）`,
        );
      }
    };
    for (const r of roots) emit(r);
    return { out, hidden };
  };

  const head = [
    "白板结构（树形大纲）：缩进表示知识的父子关系；L0 是起点问题，L1 是第一层，同一层 L 号相同的卡片是并列的子问题。左右表示同层概念的阅读或学习顺序，上下表示知识从整体到细节的深入，层级不表示提问或探索的先后。",
    "§ 编号由祖先次序拼成（§2.1 是 §2 下的第 1 张），同一父卡下按编号从左到右排列。方括号里是学习者的掌握度；[id:…] 是生成节点时可引用的卡片 id。",
    ...(roots.length > 1
      ? [
          `这张白板有 ${roots.length} 个并列的起点（L0），从左到右排列；第一个之后的起点用字母编号（§B 下的卡片是 §B1、§B1.2）。`,
        ]
      : []),
  ];
  const links = board.relations
    .filter((r) => byId.has(r.source) && byId.has(r.target))
    .map(
      (r) =>
        `- ${label(byId.get(r.source)!)} —${clip(r.label || "关联", 20)}→ ${label(byId.get(r.target)!)}`,
    );
  const about: string[] = [];
  for (const id of focusIds) {
    const n = byId.get(id)!;
    const path: string[] = [];
    for (
      let c: ConceptNode | undefined = n;
      c;
      c = c.parentId ? byId.get(c.parentId) : undefined
    )
      path.unshift(c.parentId ? label(c) : rootName(c));
    const siblings = (kids.get(n.parentId) ?? []).filter((s) => s.id !== id);
    const children = kids.get(id) ?? [];
    const parent = n.parentId ? byId.get(n.parentId) : undefined;
    about.push(
      `${id === anchor ? "当前卡片" : "已选入的卡片"}：${n.parentId ? label(n) : rootName(n)}（L${depth.get(id)}，${STATUS[n.status]}） [id:${n.id}]`,
      `  知识父节点：${parent ? `${label(parent)} [id:${parent.id}]` : "无（顶层起点）"}`,
      `  路径：${path.join(" › ")}`,
      `  同层兄弟（按顺序）：${siblings.map(label).join("、") || "无"}`,
      `  子卡片（按顺序）：${children.map(label).join("、") || "无"}`,
    );
  }
  const compose = (outlineLines: string[], note?: string, linkLines = links) =>
    [
      ...head,
      ...outlineLines,
      ...(note ? [note] : []),
      ...(linkLines.length ? ["跨枝连线：", ...linkLines] : []),
      ...about,
    ].join("\n");

  let text = compose(outline(true).out);
  if (text.length <= budget) return text;
  const { out, hidden } = outline(false);
  const note = `（白板较大：只完整列出第一层、当前卡片的路径、兄弟和子孙；其余 ${hidden} 张卡已折叠。）`;
  text = compose(out, note, links.slice(0, 12));
  if (text.length <= budget) return text;
  // Still too big (a very wide first level): keep the head, focus and tail.
  const tail = compose([], note, links.slice(0, 6));
  const room = Math.max(0, budget - tail.length - 40);
  let used = 0;
  const kept: string[] = [];
  for (const l of out) {
    if (used + l.length + 1 > room) break;
    kept.push(l);
    used += l.length + 1;
  }
  return compose([...kept, "…（大纲已截断）"], note, links.slice(0, 6)).slice(
    0,
    budget,
  );
}
