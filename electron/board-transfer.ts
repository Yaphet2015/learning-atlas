import type { Board } from "../src/shared/types.js";
import {
  importedBoard,
  parseBoardTransfer,
  type BoardTransfer,
} from "../src/shared/transfer.js";

/** Publish the board only after every transcript has been restored successfully. */
export async function importTransferredBoard(
  text: string,
  store: {
    save(board: Board): Promise<void>;
    delete(id: string): Promise<void>;
  },
  runtime: {
    importHistory(
      boardId: string,
      conversation: BoardTransfer["conversations"][number],
    ): Promise<void>;
    discardImportedBoard(boardId: string): Promise<void>;
  },
): Promise<Board> {
  const transfer = parseBoardTransfer(text);
  const board = importedBoard(transfer);
  try {
    for (const conversation of transfer.conversations) {
      if (conversation.messages.length)
        await runtime.importHistory(board.id, conversation);
    }
    await store.save(board);
    return board;
  } catch (error) {
    await store.delete(board.id).catch(() => undefined);
    await runtime.discardImportedBoard(board.id).catch(() => undefined);
    throw error;
  }
}
