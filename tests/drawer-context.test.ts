import { describe, expect, it } from "vitest";
import {
  canvasBundle,
  canvasTutorInstructions,
  tutorInstructions,
} from "../electron/prompts";
import { createWalkthroughBoard, newNote } from "../src/model/boards";
import { contextForNote } from "../src/model/context";

describe("drawer answers", () => {
  it("send the board outline without the full card review", () => {
    const board = createWalkthroughBoard();
    const note = newNote(
      board,
      { x: 0, y: 0 },
      { kind: "node", id: "concept-dom" },
    );
    board.notes.push(note);
    const ctx = contextForNote(board, note.id, null, false, "outline");
    expect(ctx.structure).toContain("◀ 当前卡片");
    expect(ctx.review).toBeUndefined();
    const kept = canvasBundle(contextForNote(board, note.id, null));
    expect(kept.structure).toBe(ctx.structure);
    expect(kept.review).toBeUndefined();
  });
  it("ask for substance rather than a 250-character cap, in both prompts", () => {
    for (const prompt of [
      tutorInstructions("answer"),
      canvasTutorInstructions(),
    ]) {
      expect(prompt).not.toContain("250");
      expect(prompt).toContain("300–600");
      expect(prompt).toContain("“类比：”");
    }
    expect(canvasTutorInstructions()).toContain("白板结构");
  });
});
