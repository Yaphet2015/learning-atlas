import type { Board } from "../shared/types";

/** Keep the live conversation cache while adopting committed canvas identities/bindings. */
export function reconcileCanvasResult(
  current: Board,
  result: Board,
  beforeCommit?: Board,
): Board {
  const saved = new Map(result.notes.map((note) => [note.id, note]));
  const before = new Map(beforeCommit?.notes.map((note) => [note.id, note]));
  const nodes = new Set(result.nodes.map((node) => node.id));
  const relations = new Set(result.relations.map((relation) => relation.id));
  const notes = current.notes.map((local) => {
    const note = saved.get(local.id);
    const prior = before.get(local.id);
    const value = { ...local };
    if (note) {
      for (const key of ["attachedTo", "contextCards", "excludedRefs"] as const)
        if (
          !beforeCommit ||
          JSON.stringify(local[key]) === JSON.stringify(prior?.[key])
        )
          Object.assign(value, { [key]: note[key] });
    }
    const messages = new Map(
      (note?.messages ?? []).map((message) => [message.id, message]),
    );
    for (const message of local.messages) messages.set(message.id, message);
    value.messages = [...messages.values()]
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .slice(-200);
    if (
      value.attachedTo &&
      !(value.attachedTo.kind === "node" ? nodes : relations).has(
        value.attachedTo.id,
      )
    )
      delete value.attachedTo;
    if (value.contextCards)
      value.contextCards = value.contextCards.filter((id) => nodes.has(id));
    return value;
  });
  return { ...result, notes, viewport: current.viewport };
}
