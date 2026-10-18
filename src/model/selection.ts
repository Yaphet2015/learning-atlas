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

/** The cards currently selected on the canvas: the pick, else the single card. */
export function selectedCards(state: CardPick): string[] {
  return state.picked.length
    ? [...state.picked]
    : state.single
      ? [state.single]
      : [];
}

/**
 * The one rule for every entry point that opens an AI conversation (问 AI, /, the card
 * menu, 让 AI 带我开始, the drawer's new conversation): the selected cards come along as
 * context. The anchor is the entry point's own card when it has one, else the first selected
 * card; every other selected card that still exists becomes a context card.
 */
export function chatContext(
  selected: string[],
  anchor: string | null | undefined,
  exists: (id: string) => boolean = () => true,
): { anchor: string | null; contextCards: string[] } {
  const cards = [...new Set(selected)].filter(exists);
  const main = anchor ?? cards[0] ?? null;
  return { anchor: main, contextCards: cards.filter((id) => id !== main) };
}

/** Title for a conversation that carries several cards. */
export function manyCardsTitle(anchorTitle: string, extra: number): string {
  return `关于「${anchorTitle}」等 ${extra + 1} 张卡`.slice(0, 160);
}
