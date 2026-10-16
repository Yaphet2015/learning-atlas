import type {
  Board,
  ConceptNode,
  Point,
  Relation,
  StickyNote,
} from "../shared/types";
import {
  aiMapSchema,
  boardSchema,
  pointSchema,
  treeify,
} from "../shared/validation";

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
  const sourceIds = new Set<string>();
  for (const item of map.nodes) {
    if (sourceIds.has(item.id) || item.id === "anchor" || item.id === anchor.id)
      throw new Error("AI 返回了重复或保留的节点编号。请重试。");
    sourceIds.add(item.id);
  }
  const ids = new Map(map.nodes.map((item) => [item.id, newId("concept")]));
  const resolve = (id: string) =>
    id === "anchor" || id === anchor.id ? anchor.id : ids.get(id);
  const generatedRelations: Relation[] = [];
  const pairs = new Set<string>();
  for (const edge of map.relations) {
    const source = resolve(edge.source);
    const target = resolve(edge.target);
    if (!source || !target || source === target)
      throw new Error("AI 返回了无效的关系，画布没有改变。");
    const key = `${source}:${target}`;
    if (!pairs.has(key))
      generatedRelations.push(
        relation(newId("relation"), source, target, edge.label),
      );
    pairs.add(key);
  }
  const children = map.nodes.map((item) => ({
    ...node(ids.get(item.id)!, item.title, item.body, anchor.id, 0),
    ...(item.visual
      ? { visual: { ...item.visual, labels: [...item.visual.labels] } }
      : {}),
  }));
  // First incoming edge becomes the tree parent (nodes without one hang under
  // the anchor); remaining edges are kept as cross-links. Order follows the
  // model's listing, appended after existing children.
  const index = new Map(children.map((c, i) => [c.id, i]));
  const tree = treeify(
    [anchor.id, ...children.map((c) => c.id)],
    generatedRelations,
    anchor.id,
    (id) => index.get(id) ?? -1,
  );
  const existing = board.nodes.filter((n) => n.parentId === anchor.id).length;
  const placed = children.map((c) => {
    const parentId = tree.parent.get(c.id) ?? anchor.id;
    return {
      ...c,
      parentId,
      order:
        (tree.order.get(c.id) ?? 0) + (parentId === anchor.id ? existing : 0),
    };
  });
  const cross = tree.cross.map((r) =>
    relation(r.id, r.source, r.target, r.label),
  );
  return boardSchema.parse({
    ...board,
    updatedAt: now(),
    nodes: [
      ...board.nodes.map((item) =>
        item.id === anchor.id
          ? {
              ...item,
              expanded: true,
              status: item.status === "explained" ? "explained" : "exploring",
            }
          : item,
      ),
      ...placed,
    ],
    relations: [...board.relations, ...cross],
  });
}
