import type { Board, ChatMessage, Selection } from "../shared/types";
import { LIMITS } from "../shared/validation";

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
  const removedRelations = new Set(
    board.relations
      .filter((edge) =>
        kind === "relation"
          ? edge.id === id
          : edge.source === id || edge.target === id,
      )
      .map((edge) => edge.id),
  );
  return {
    ...board,
    nodes:
      kind === "node"
        ? board.nodes.filter((node) => node.id !== id)
        : board.nodes,
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
