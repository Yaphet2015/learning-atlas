import type {
  Board,
  ContextBundle,
  ContextReference,
  Relation,
  Selection,
} from "../shared/types";
import { contextBundleSchema } from "../shared/validation";
import { serializeStructure } from "./structure";
import { cardReview } from "./card-review";

/** How a reference is named in note.excludedRefs. */
export const refKey = (r: Pick<ContextReference, "kind" | "id">) =>
  `${r.kind}:${r.id}`;

const clip = (value: string, length: number) =>
  value.length <= length ? value : `${value.slice(0, length - 1)}…`;

/** Selected references, a compact outline, and the four-level card review. */
export function contextForNote(
  board: Board,
  noteId: string,
  selection?: Selection,
  /** The drawer lists unticked references too, so they can be ticked back. */
  keepExcluded = false,
  scope: "review" | "references" = "review",
): ContextBundle {
  const note = board.notes.find((item) => item.id === noteId);
  if (!note) throw new Error("找不到这张便签。");
  const topic = clip(board.topic, 2_000);
  const references: ContextReference[] = [
    { id: board.id, kind: "topic", title: "最初的学习主题", text: topic },
  ];
  const seen = new Set([`topic:${board.id}`]);
  const add = (reference: ContextReference) => {
    const key = `${reference.kind}:${reference.id}`;
    if (!seen.has(key) && references.length < 18) {
      seen.add(key);
      references.push({
        ...reference,
        title: clip(reference.title, 160),
        text: clip(reference.text, 1_200),
      });
    }
  };
  const addNode = (id: string) => {
    const node = board.nodes.find((item) => item.id === id);
    if (node) {
      const sceneDetails =
        node.kind === "scene"
          ? [
              `当前盒子宽度：${board.scene.width}px；背景色：${board.scene.color}。`,
              `最近改变：${board.scene.changed === "width" ? "宽度" : board.scene.changed === "color" ? "颜色" : "尚未改变"}。`,
              board.scene.prediction
                ? `我的预测：${clip(board.scene.prediction, 300)}`
                : "",
              board.scene.explanation
                ? `我的解释：${clip(board.scene.explanation, 500)}`
                : "",
            ]
              .filter(Boolean)
              .join("\n")
          : "";
      const visualDetails = node.visual
        ? [
            `图示（${node.visual.basis === "analogy" ? "类比示意，并非实际结构" : "直接示意"}）：${node.visual.title ?? node.title}`,
            node.visual.labels.join(
              node.visual.kind === "process"
                ? " → "
                : node.visual.kind === "comparison"
                  ? " 对比 "
                  : " · ",
            ),
            node.visual.caption ?? "",
          ]
            .filter(Boolean)
            .join("\n")
        : "";
      const details = [visualDetails, sceneDetails].filter(Boolean).join("\n");
      add({
        id,
        kind: "node",
        title: node.title,
        text: details ? `${clip(node.body, 500)}\n${details}` : node.body,
      });
    }
  };
  const addRelation = (edge: Relation) => {
    const source = board.nodes.find((item) => item.id === edge.source);
    const target = board.nodes.find((item) => item.id === edge.target);
    if (!source || !target) return;
    add({
      id: edge.id,
      kind: "relation",
      title: edge.label || "节点关系",
      text: `${source.title} → ${target.title}：${edge.label}`,
    });
    addNode(edge.source);
    addNode(edge.target);
  };
  add({
    id: note.id,
    kind: "note",
    title: note.title || "当前便签",
    text: note.text,
  });
  // Cards the learner picked come before the neighbourhood, so they are never cut.
  for (const id of note.contextCards ?? []) addNode(id);
  const selected =
    selection?.kind === "node" || selection?.kind === "relation"
      ? selection
      : note.attachedTo;
  if (selected?.kind === "node") {
    addNode(selected.id);
    // Tree neighbours: the parent, then up to three children in 先→后 order.
    const self = board.nodes.find((item) => item.id === selected.id);
    if (self?.parentId) addNode(self.parentId);
    board.nodes
      .filter((item) => item.parentId === selected.id)
      .sort((a, b) => a.order - b.order)
      .slice(0, 3)
      .forEach((item) => addNode(item.id));
    // One hop across branches, at most three cross-links. Outgoing come first.
    const nearby = board.relations
      .filter(
        (edge) => edge.source === selected.id || edge.target === selected.id,
      )
      .sort(
        (a, b) =>
          Number(b.source === selected.id) - Number(a.source === selected.id),
      )
      .slice(0, 3);
    nearby.forEach(addRelation);
  } else if (selected?.kind === "relation") {
    const edge = board.relations.find((item) => item.id === selected.id);
    if (edge) {
      addRelation(edge);
      // A relation's endpoints provide its meaning. Add only its nearest downstream
      // branch, rather than every edge attached to both endpoint nodes.
      board.nodes
        .filter((item) => item.parentId === edge.target)
        .sort((a, b) => a.order - b.order)
        .slice(0, 2)
        .forEach((item) => addNode(item.id));
      board.relations
        .filter((item) => item.id !== edge.id && item.source === edge.target)
        .slice(0, 2)
        .forEach(addRelation);
    }
  }
  // Unticked in the drawer: not sent. The topic and the note itself always are.
  const excluded = new Set(keepExcluded ? [] : (note.excludedRefs ?? []));
  const sent = references.filter(
    (r) => r.kind === "topic" || r.kind === "note" || !excluded.has(refKey(r)),
  );
  references.splice(0, references.length, ...sent);
  const summary = references
    .map((item) => `[${item.kind}:${item.id}] ${item.title}\n${item.text}`)
    .join("\n\n");
  if (scope === "references")
    return contextBundleSchema.parse({ topic, references, summary });
  // The whole map, compactly: the tutor can answer questions about levels,
  // order and links without the learner pasting them.
  const anchor = selected?.kind === "node" ? selected.id : null;
  const structure = serializeStructure(board, {
    anchor,
    cards: note.contextCards,
  });
  const reviewFocus = anchor ? [anchor] : [];
  reviewFocus.push(...(note.contextCards ?? []));
  if (selected?.kind === "relation") {
    const edge = board.relations.find((item) => item.id === selected.id);
    if (edge) reviewFocus.push(edge.source, edge.target);
  }
  return contextBundleSchema.parse({
    topic,
    references,
    summary,
    ...(structure ? { structure } : {}),
    review: cardReview(board, reviewFocus, note.excludedRefs),
  });
}
