/**
 * Canvas multi-select. One card is the ordinary selection (toolbar, keys);
 * two or more are a "pick" that can be asked about together.
 */
export interface CardPick {
  single: string | null;
  picked: string[];
}

/** Shift/⌘/Ctrl-click: toggle a card in or out, starting from the current single card. */
export function toggleCard(state: CardPick, id: string): CardPick {
  const base = state.picked.length
    ? state.picked
    : state.single
      ? [state.single]
      : [];
  const next = base.includes(id) ? base.filter((x) => x !== id) : [...base, id];
  return settle(next);
}

/** Box selection result (ids in canvas order), optionally added to what was picked. */
export function boxPick(
  state: CardPick,
  ids: string[],
  additive: boolean,
): CardPick {
  const start = additive
    ? state.picked.length
      ? state.picked
      : state.single
        ? [state.single]
        : []
    : [];
  return settle([...start, ...ids.filter((id) => !start.includes(id))]);
}

/** Zero or one card is an ordinary selection; two or more stay a pick. */
export function settle(ids: string[]): CardPick {
  const unique = [...new Set(ids)];
  if (unique.length >= 2) return { single: null, picked: unique };
  return { single: unique[0] ?? null, picked: [] };
}

/** Context cards stored on a note, toggled from the drawer's picker. */
export function toggleContextCard(
  note: { contextCards?: string[]; excludedRefs?: string[] },
  id: string,
  /** The card is already referenced automatically (anchor neighbourhood). */
  automatic: boolean,
): { contextCards: string[]; excludedRefs: string[] } {
  const key = `node:${id}`;
  const cards = note.contextCards ?? [];
  const excluded = note.excludedRefs ?? [];
  const included = cards.includes(id) || (automatic && !excluded.includes(key));
  if (included)
    return {
      contextCards: cards.filter((c) => c !== id),
      excludedRefs: automatic ? [...new Set([...excluded, key])] : excluded,
    };
  return {
    contextCards: automatic ? cards : [...cards, id],
    excludedRefs: excluded.filter((k) => k !== key),
  };
}
