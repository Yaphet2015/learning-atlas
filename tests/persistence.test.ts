import { describe, expect, it } from "vitest";
import {
  flushBoardCache,
  loadBoardForNavigation,
} from "../src/model/persistence";
import { createEmptyBoard } from "../src/model/boards";
describe("all-board close flush", () => {
  it("drains a delayed completion and saves the offscreen board too", async () => {
    const a = createEmptyBoard("A"),
      b = createEmptyBoard("B");
    const cache = new Map([
      [a.id, a],
      [b.id, b],
    ]);
    const writes = new Map<string, string>();
    let pending: Promise<void>[] = [];
    const task = new Promise<void>((resolve) =>
      setTimeout(() => {
        cache.set(a.id, { ...a, title: "Completed offscreen" });
        pending = [];
        resolve();
      }, 10),
    );
    pending = [task];
    await flushBoardCache(
      cache,
      async (board) => {
        writes.set(board.id, board.title);
      },
      () => pending,
    );
    expect(writes.get(a.id)).toBe("Completed offscreen");
    expect(writes.get(b.id)).toBe("B");
  });
  it("rebases an edit that arrives during an awaited save", async () => {
    const board = createEmptyBoard("Before");
    const cache = new Map([[board.id, board]]);
    const writes: string[] = [];
    await flushBoardCache(
      cache,
      async (value) => {
        writes.push(value.title);
        if (writes.length === 1)
          cache.set(board.id, { ...board, title: "After" });
      },
      () => [],
    );
    expect(writes).toEqual(["Before", "After"]);
  });
  it("rejects if any offscreen save fails and permits a later retry", async () => {
    const a = createEmptyBoard("A"),
      b = createEmptyBoard("B");
    const cache = new Map([
      [a.id, a],
      [b.id, b],
    ]);
    await expect(
      flushBoardCache(
        cache,
        async (board) => {
          if (board.id === b.id) throw new Error("disk full");
        },
        () => [],
      ),
    ).rejects.toThrow("disk full");
    const saved: string[] = [];
    await flushBoardCache(
      cache,
      async (board) => {
        saved.push(board.id);
      },
      () => [],
    );
    expect(saved).toEqual([a.id, b.id]);
  });
});

it("navigation returns a completion that arrived during its final save", async () => {
  const board = createEmptyBoard("Before");
  const cache = new Map([[board.id, board]]);
  const final = { ...board, title: "Completed while loading" };
  const result = await loadBoardForNavigation(
    board.id,
    cache,
    async () => board,
    async () => {
      await Promise.resolve();
      cache.set(board.id, final);
    },
  );
  expect(result).toBe(final);
});
