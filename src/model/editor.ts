import type {
  Board,
  ChatMessage,
  ConceptNode,
  Selection,
} from "../shared/types";
import { LIMITS } from "../shared/validation";

/** Renumber each sibling group to 0..k-1, keeping the current relative order. */
export function normalizeOrder(nodes: ConceptNode[]): ConceptNode[] {
  const groups = new Map<string | null, ConceptNode[]>();
  for (const n of nodes)
    groups.set(n.parentId, [...(groups.get(n.parentId) ?? []), n]);
  const order = new Map<string, number>();
  for (const group of groups.values())
    group
      .map((n, i) => ({ n, i }))
      .sort((a, b) => a.n.order - b.n.order || a.i - b.i)
      .forEach(({ n }, i) => order.set(n.id, i));
  return nodes.map((n) =>
    n.order === order.get(n.id) ? n : { ...n, order: order.get(n.id)! },
  );
}

const blank = (id: string, parentId: string, order: number): ConceptNode => ({
  id,
  kind: "concept",
  title: "新的概念",
  body: "",
  parentId,
  order,
  status: "unseen",
});

/** Insert a node at `order` among `parentId`'s children, shifting later siblings. */
function insertAt(
  board: Board,
  node: ConceptNode,
  parentId: string,
  order: number,
): Board {
  const others = board.nodes.filter((n) => n.id !== node.id);
  const shifted = others.map((n) =>
    n.parentId === parentId && n.order >= order
      ? { ...n, order: n.order + 1 }
      : n,
  );
  return {
    ...board,
    nodes: normalizeOrder([...shifted, { ...node, parentId, order }]),
  };
}

/** Tab: append a new unseen child at the end of the parent's row. */
export function addChild(board: Board, parentId: string, id: string): Board {
  if (!board.nodes.some((n) => n.id === parentId)) return board;
  const count = board.nodes.filter((n) => n.parentId === parentId).length;
  return insertAt(board, blank(id, parentId, count), parentId, count);
}

/** Enter: insert a sibling directly after `siblingId` (order + 1). */
export function addSibling(board: Board, siblingId: string, id: string): Board {
  const sibling = board.nodes.find((n) => n.id === siblingId);
  if (!sibling?.parentId) return board;
  return insertAt(
    board,
    blank(id, sibling.parentId, sibling.order + 1),
    sibling.parentId,
    sibling.order + 1,
  );
}

function isInSubtree(board: Board, ancestor: string, id: string) {
  for (
    let cursor: string | null | undefined = id;
    cursor;
    cursor = board.nodes.find((n) => n.id === cursor)?.parentId
  )
    if (cursor === ancestor) return true;
  return false;
}

/** Move `id` to `order` within its current row. */
export function reorder(board: Board, id: string, order: number): Board {
  const node = board.nodes.find((n) => n.id === id);
  if (!node?.parentId) return board;
  return reparent(board, id, node.parentId, order);
}

/** Move `id` (and its subtree) under `parentId` at `order`; refuses cycles. */
export function reparent(
  board: Board,
  id: string,
  parentId: string,
  order?: number,
): Board {
  const node = board.nodes.find((n) => n.id === id);
  if (
    !node?.parentId ||
    !board.nodes.some((n) => n.id === parentId) ||
    isInSubtree(board, id, parentId)
  )
    return board;
  const withoutNode = {
    ...board,
    nodes: normalizeOrder(board.nodes.filter((n) => n.id !== id)),
  };
  const count = withoutNode.nodes.filter((n) => n.parentId === parentId).length;
  const target = Math.max(0, Math.min(order ?? count, count));
  return insertAt(withoutNode, node, parentId, target);
}

/** Remove one selected item and detach notes from every incident relation removed. */
export function removeSelection(board: Board, selection: Selection): Board {
  if (!selection) return board;
  const { kind, id } = selection;
  const exists = (
    kind === "node"
      ? board.nodes
      : kind === "relation"
        ? board.relations
        : board.notes
  ).some((item) => item.id === id);
  if (!exists) return board;
  if (kind === "note")
    return { ...board, notes: board.notes.filter((note) => note.id !== id) };
  const removed = board.nodes.find((n) => n.id === id);
  // The root question cannot be removed: every map grows from it.
  if (kind === "node" && removed?.parentId === null) return board;
  const removedRelations = new Set(
    board.relations
      .filter((edge) =>
        kind === "relation"
          ? edge.id === id
          : edge.source === id || edge.target === id,
      )
      .map((edge) => edge.id),
  );
  // Children of a removed node take its place in the parent's row.
  const nodes =
    kind === "node" && removed
      ? normalizeOrder(
          board.nodes
            .filter((node) => node.id !== id)
            .map((node) =>
              node.parentId === id
                ? {
                    ...node,
                    parentId: removed.parentId,
                    order: removed.order + node.order / 1000,
                  }
                : node.parentId === removed.parentId &&
                    node.order > removed.order
                  ? { ...node, order: node.order + 1 }
                  : node,
            ),
        )
      : board.nodes;
  return {
    ...board,
    nodes,
    relations: board.relations.filter((edge) => !removedRelations.has(edge.id)),
    notes: board.notes.map((note) => {
      const attachment = note.attachedTo;
      if (
        !attachment ||
        !(attachment.kind === "node"
          ? kind === "node" && attachment.id === id
          : removedRelations.has(attachment.id))
      )
        return note;
      const { attachedTo: _removed, ...detached } = note;
      return detached;
    }),
  };
}

/** Keep a bounded renderer cache; the durable runtime owns the complete history. */
export function cacheMessages(messages: ChatMessage[]): ChatMessage[] {
  const seen = new Set<string>();
  const recent: ChatMessage[] = [];
  for (
    let index = messages.length - 1;
    index >= 0 && recent.length < LIMITS.messagesPerNote;
    index -= 1
  ) {
    const message = messages[index];
    if (seen.has(message.id)) continue;
    seen.add(message.id);
    recent.push({ ...message, text: message.text.slice(0, 32_000) });
  }
  return recent.reverse();
}

/**
 * The durable runtime's history replaces the renderer cache on load, under its
 * own message ids. Carry renderer-only meta (ticked steps, laid outline) over
 * from the cached copy of the same message (same id, or same role and text).
 */
export function mergeHistory(
  cached: ChatMessage[],
  history: ChatMessage[],
): ChatMessage[] {
  const byId = new Map(cached.map((m) => [m.id, m]));
  const byText = new Map(cached.map((m) => [`${m.role}\u0000${m.text}`, m]));
  return cacheMessages(
    history.map((m) => {
      const meta = (byId.get(m.id) ?? byText.get(`${m.role}\u0000${m.text}`))
        ?.meta;
      return meta && !m.meta ? { ...m, meta } : m;
    }),
  );
}
