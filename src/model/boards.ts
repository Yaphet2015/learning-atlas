import type {
  Board,
  ConceptNode,
  Point,
  Relation,
  StickyNote,
} from "../shared/types";
import { aiMapSchema, boardSchema, pointSchema } from "../shared/validation";

export function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}
const now = () => new Date().toISOString();
const defaultScene = () => ({
  width: 180,
  color: "#E9AE7E",
  prediction: "",
  explanation: "",
  changed: null,
});
const node = (
  id: string,
  title: string,
  body: string,
  parentId: string | null,
  order: number,
): ConceptNode => ({
  id,
  kind: "concept",
  title,
  body,
  parentId,
  order,
  status: "unseen",
});
const relation = (
  id: string,
  source: string,
  target: string,
  label: string,
): Relation => ({ id, source, target, label, kind: "cross" });

export function createWalkthroughBoard(): Board {
  const timestamp = now();
  return {
    version: 2,
    id: newId("board"),
    title: "浏览器如何画出一个页面",
    topic: "浏览器如何把 HTML、CSS 变成屏幕上的页面？",
    kind: "walkthrough",
    createdAt: timestamp,
    updatedAt: timestamp,
    nodes: [
      {
        ...node(
          "scene-browser",
          "浏览器，把代码变成画面",
          "改一个属性，看看浏览器需要重新做哪些工作。",
          null,
          0,
        ),
        kind: "scene",
        status: "exploring",
      },
      node(
        "concept-dom",
        "DOM",
        "HTML 变成一棵描述内容和结构的树。",
        "scene-browser",
        0,
      ),
      node(
        "concept-style",
        "样式计算",
        "把 CSS 规则匹配到元素，算出每个元素最终的样式。",
        "scene-browser",
        1,
      ),
      node(
        "concept-render",
        "布局与绘制",
        "先确定元素的位置和尺寸，再把它们画成像素。",
        "scene-browser",
        2,
      ),
    ],
    // 先→后 is expressed by sibling order; the one cross-branch link stays.
    relations: [
      relation(
        "relation-style-render",
        "concept-style",
        "concept-render",
        "决定如何显示",
      ),
    ],
    notes: [],
    scene: defaultScene(),
  };
}

export function createEmptyBoard(topic: string): Board {
  const trimmed = topic.trim();
  if (!trimmed || trimmed.length > 2_000)
    throw new Error("请输入 1–2000 字的学习主题。");
  const timestamp = now();
  return {
    version: 2,
    id: newId("board"),
    title: trimmed.slice(0, 160),
    topic: trimmed,
    kind: "ai",
    createdAt: timestamp,
    updatedAt: timestamp,
    nodes: [
      node(
        newId("topic"),
        trimmed.slice(0, 160),
        "这是你的学习起点。选中它，在便签里提出第一个问题。",
        null,
        0,
      ),
    ],
    relations: [],
    notes: [],
    scene: defaultScene(),
  };
}

/** Creates a note without mutating the board. The caller decides where to insert it. */
export function newNote(
  board: Board,
  position: Point,
  attachment?: StickyNote["attachedTo"],
): StickyNote {
  pointSchema.parse(position);
  if (
    attachment &&
    !(attachment.kind === "node" ? board.nodes : board.relations).some(
      (item) => item.id === attachment.id,
    )
  ) {
    throw new Error("无法把便签连接到不存在的内容。");
  }
  return {
    id: newId("note"),
    title: "我的问题",
    text: "",
    position: { ...position },
    ...(attachment ? { attachedTo: { ...attachment } } : {}),
    messages: [],
    createdAt: now(),
  };
}

/** The built-in example expands one local branch at a time; it never claims mastery. */
export function expandWalkthrough(board: Board, nodeId: string): Board {
  if (board.kind !== "walkthrough") return board;
  const selected = board.nodes.find((item) => item.id === nodeId);
  if (!selected || selected.expanded || selected.kind === "scene") return board;
  let children: ConceptNode[] = [];
  if (nodeId === "concept-dom") {
    children = [
      node(
        "concept-dom-tree",
        "标签，组成一棵树",
        "父子关系决定结构。改变颜色不会自动改变这棵树。",
        nodeId,
        0,
      ),
    ];
  } else if (nodeId === "concept-style") {
    children = [
      node(
        "concept-computed-style",
        "最终生效的样式",
        "多条规则可能同时命中元素；层叠与继承共同决定最终的属性值。",
        nodeId,
        0,
      ),
    ];
  } else if (nodeId === "concept-render") {
    children = [
      node(
        "concept-layout",
        "布局：放在哪里？",
        "计算几何信息：宽高和位置。改变宽度可能让后面的元素重新排列。",
        nodeId,
        0,
      ),
      node(
        "concept-paint",
        "绘制：长什么样？",
        "生成颜色、文字、边框等绘制内容。只改背景色通常不需要重新布局。",
        nodeId,
        1,
      ),
    ];
  } else {
    return board;
  }
  const existing = new Set(board.nodes.map((item) => item.id));
  children = children.filter((item) => !existing.has(item.id));
  return {
    ...board,
    updatedAt: now(),
    nodes: [
      ...board.nodes.map((item) =>
        item.id === nodeId
          ? {
              ...item,
              expanded: true,
              status:
                item.status === "explained"
                  ? ("explained" as const)
                  : ("exploring" as const),
            }
          : item,
      ),
      ...children,
    ],
  };
}

/** Labels that only say "comes next"; the sibling arrows already show that. */
const SEQUENCE_LABEL = /先|后|然后|接着|下一步|next/i;

/** Parse data only: generated JavaScript/HTML is never compiled, rendered, or evaluated. */
export function buildMapFromAI(
  text: string,
  board: Board,
  anchorId?: string,
): Board {
  if (text.length > 32_000)
    throw new Error("AI 返回的知识图谱过大，请缩小问题范围。");
  let json = text.trim();
  const fenced = /^```(?:json)?\s*\n?([\s\S]*?)\n?```\s*$/i.exec(json);
  if (fenced) json = fenced[1].trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error("AI 未返回有效的图谱 JSON。你的画布没有改变，请重试。");
  }
  const result = aiMapSchema.safeParse(parsed);
  if (!result.success)
    throw new Error(
      "AI 返回的图谱不符合格式要求。请要求 1–6 个纯文本节点，并重试。",
    );
  const map = result.data;
  const anchor = board.nodes.find(
    (item) => item.id === (anchorId ?? board.nodes[0]?.id),
  );
  if (!anchor) throw new Error("请先选择一个学习起点。");
  // Existing ids keep their identity; generated ids are replaced before insertion.
  const resolvedIds = new Map(board.nodes.map((item) => [item.id, item.id]));
  resolvedIds.set("anchor", anchor.id);
  for (const item of map.nodes) {
    if (resolvedIds.has(item.id))
      throw new Error("AI 返回了重复或保留的节点编号。请重试。");
    resolvedIds.set(item.id, newId("concept"));
  }
  function resolveParent(parent: string | null | undefined): string | null {
    if (parent === null) return null;
    // Omitted parents remain compatible with older, single-level responses.
    const id = resolvedIds.get(parent ?? "anchor");
    if (!id) throw new Error("AI 返回的父节点不存在，画布没有改变。请重试。");
    return id;
  }
  const parents = new Map(
    map.nodes.map((item) => [
      resolvedIds.get(item.id)!,
      resolveParent(item.parent),
    ]),
  );
  for (const id of parents.keys()) {
    const seen = new Set<string>();
    let cursor: string | null = id;
    while (cursor !== null && parents.has(cursor)) {
      if (seen.has(cursor))
        throw new Error("AI 返回的知识层级存在循环，画布没有改变。请重试。");
      seen.add(cursor);
      cursor = parents.get(cursor) ?? null;
    }
  }
  // Knowledge parents decide the rows. Listing order decides only the order
  // within each sibling group, after that group's existing cards.
  const nextOrder = new Map<string | null, number>();
  for (const item of board.nodes)
    nextOrder.set(
      item.parentId,
      Math.max(nextOrder.get(item.parentId) ?? 0, item.order + 1),
    );
  const placed = map.nodes.map((item) => {
    const id = resolvedIds.get(item.id)!;
    const parent = parents.get(id) ?? null;
    const order = nextOrder.get(parent) ?? 0;
    nextOrder.set(parent, order + 1);
    return {
      ...node(id, item.title, item.body, parent, order),
      ...(item.visual
        ? { visual: { ...item.visual, labels: [...item.visual.labels] } }
        : {}),
    };
  });
  const nodesById = new Map([...board.nodes, ...placed].map((n) => [n.id, n]));
  const cross: Relation[] = [];
  const pairs = new Set<string>();
  for (const edge of map.relations) {
    const source = resolvedIds.get(edge.source);
    const target = resolvedIds.get(edge.target);
    if (!source || !target || source === target)
      throw new Error("AI 返回了无效的关系，画布没有改变。");
    const a = nodesById.get(source)!,
      b = nodesById.get(target)!;
    // Direct parent-child relations are already shown by the tree.
    if (a.parentId === b.id || b.parentId === a.id) continue;
    // Only neighbouring siblings already have a left-to-right sequence arrow.
    if (
      a.parentId === b.parentId &&
      Math.abs(a.order - b.order) === 1 &&
      SEQUENCE_LABEL.test(edge.label)
    )
      continue;
    const key = [source, target].sort().join(":");
    if (pairs.has(key)) continue;
    pairs.add(key);
    cross.push(relation(newId("relation"), source, target, edge.label));
  }
  const expandedParents = new Set(parents.values());
  return boardSchema.parse({
    ...board,
    updatedAt: now(),
    nodes: [
      ...board.nodes.map((item) => {
        const hasNewChildren = expandedParents.has(item.id);
        if (item.id !== anchor.id && !hasNewChildren) return item;
        return {
          ...item,
          ...(hasNewChildren ? { expanded: true } : {}),
          status: item.status === "explained" ? "explained" : "exploring",
        };
      }),
      ...placed,
    ],
    relations: [...board.relations, ...cross],
  });
}
