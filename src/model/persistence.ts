import type { Board } from "../shared/types";
/** Drain admitted mutations, then persist every cached board. A failed write is never marked clean. */
export async function flushBoardCache(
  cache: Map<string, Board>,
  save: (board: Board) => Promise<void>,
  pending: () => Promise<void>[],
): Promise<void> {
  const persisted = new Map<string, Board>();
  for (;;) {
    await Promise.all(pending());
    for (const [id, board] of cache) {
      if (persisted.get(id) === board) continue;
      await save(board);
      persisted.set(id, board);
    }
    if (
      pending().length === 0 &&
      [...cache].every(([id, board]) => persisted.get(id) === board)
    )
      return;
  }
}

/** Re-read after the last await: a completion can update the target while navigation saves. */
export async function loadBoardForNavigation(
  id: string,
  cache: Map<string, Board>,
  load: (id: string) => Promise<Board | null>,
  flush: () => Promise<void>,
): Promise<Board | null> {
  const loaded = cache.get(id) ?? (await load(id));
  await flush();
  return cache.get(id) ?? loaded;
}
