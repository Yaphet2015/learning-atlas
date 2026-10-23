import { describe, expect, it } from "vitest";
import { migrateNoteText, parseBoard, LIMITS } from "../src/shared/validation";
import { createWalkthroughBoard } from "../src/model/boards";

function v2Board() {
  const board = createWalkthroughBoard() as unknown as Record<string, any>;
  const anchor = board.nodes[0].id;
  board.version = 2;
  board.notes = [
    {
      id: "note-a",
      title: "保什么",
      text: "  轻症赔完不影响重疾  ",
      position: { x: 10, y: 20 },
      attachedTo: { kind: "node", id: anchor },
      messages: [],
      createdAt: "2026-10-01T00:00:00.000Z",
    },
    { id: "note-b", title: "空的", text: "   ", position: { x: 0, y: 0 }, messages: [] },
  ];
  return { board, anchor };
}

describe("我的笔记 → 批注卡 migration (v2 → v3)", () => {
  it("turns non-empty note text into a 批注卡 beside its card and clears the text", () => {
    const { board, anchor } = v2Board();
    const out = parseBoard(board);
    expect(out.version).toBe(3);
    expect(out.notes).toHaveLength(3);
    const a = out.notes.find((n) => n.id === "note-a")!;
    expect(a.text).toBe("");
    const card = out.notes.find((n) => n.meta?.migratedFrom === "note-a")!;
    expect(card).toMatchObject({
      title: "我的笔记",
      text: "",
      attachedTo: { kind: "node", id: anchor },
      createdAt: "2026-10-01T00:00:00.000Z",
    });
    expect(card.messages).toHaveLength(1);
    expect(card.messages[0]).toMatchObject({ role: "user", text: "轻症赔完不影响重疾" });
    // A blank note is left alone.
    expect(out.notes.find((n) => n.id === "note-b")!.meta).toBeUndefined();
    expect(out.notes.filter((n) => n.meta?.migratedFrom === "note-b")).toHaveLength(0);
  });

  it("is idempotent: loading again, or re-running it, adds nothing", () => {
    const once = parseBoard(v2Board().board);
    expect(parseBoard(once)).toEqual(once);
    expect(migrateNoteText(once)).toEqual(once);
    // Even if stale text reappears on the source note, no second card is made.
    const stale = structuredClone(once);
    stale.notes.find((n) => n.id === "note-a")!.text = "又写了一遍";
    const again = migrateNoteText(stale);
    expect(again.notes.filter((n) => n.meta?.migratedFrom === "note-a")).toHaveLength(1);
    expect(again.notes.find((n) => n.id === "note-a")!.text).toBe("");
  });

  it("does not touch boards already on v3", () => {
    const { board } = v2Board();
    expect(parseBoard({ ...board, version: 3 }).notes[0].text).toBe("  轻症赔完不影响重疾  ");
  });

  it("keeps the text on a full board instead of dropping a note", () => {
    const { board } = v2Board();
    board.notes = Array.from({ length: LIMITS.notes }, (_, i) => ({
      id: `n${i}`,
      title: "",
      text: i === 0 ? "留着" : "",
      position: { x: 0, y: 0 },
      messages: [],
    }));
    const out = parseBoard(board);
    expect(out.notes).toHaveLength(LIMITS.notes);
    expect(out.notes[0].text).toBe("留着");
  });
});
