import { describe, expect, it } from "vitest";
import { createEmptyBoard, createWalkthroughBoard } from "../src/model/boards";
import {
  KICKOFF_MESSAGE,
  displayMessage,
  firstLevelPrompt,
  kickoffNote,
  kickoffPrompt,
  learnerAnswers,
  needsKickoff,
  rootOf,
} from "../src/model/kickoff";
import type { Board, StickyNote } from "../src/shared/types";

const note = (board: Board, messages: StickyNote["messages"]): StickyNote => ({
  id: "note-kick",
  title: "AI 带我开始",
  text: "",
  position: { x: 0, y: 0 },
  attachedTo: { kind: "node", id: rootOf(board)!.id },
  messages,
});
const msg = (role: "user" | "assistant", text: string) => ({
  id: `${role}-${text.length}`,
  role,
  text,
  createdAt: "2026-10-18T00:00:00.000Z",
});

describe("「让 AI 带我开始」 kickoff", () => {
  it("is offered only on an AI board whose root question has no children", () => {
    const fresh = createEmptyBoard("彩虹是怎么形成的？");
    expect(needsKickoff(fresh)).toBe(true);
    const root = rootOf(fresh)!;
    const grown: Board = {
      ...fresh,
      nodes: [
        ...fresh.nodes,
        { ...root, id: "child", parentId: root.id, order: 0, title: "折射" },
      ],
    };
    expect(needsKickoff(grown)).toBe(false);
    expect(needsKickoff(createWalkthroughBoard())).toBe(false);
    expect(needsKickoff(null)).toBe(false);
  });
  it("finds the root's conversation, not other notes", () => {
    const board = createEmptyBoard("彩虹");
    expect(kickoffNote(board)).toBeUndefined();
    const kick = note(board, []);
    const free = { ...kick, id: "free", attachedTo: undefined };
    expect(kickoffNote({ ...board, notes: [free, kick] })?.id).toBe(kick.id);
  });
  it("asks what the learner knows before teaching, and shows only the short line", () => {
    const prompt = kickoffPrompt("彩虹是怎么形成的？");
    expect(prompt.startsWith(KICKOFF_MESSAGE)).toBe(true);
    expect(prompt).toContain("「彩虹是怎么形成的？」");
    expect(prompt).toContain("已经知道");
    expect(displayMessage("user", prompt)).toBe(KICKOFF_MESSAGE);
    expect(displayMessage("assistant", prompt)).toBe(prompt);
    expect(displayMessage("user", "我知道折射")).toBe("我知道折射");
  });
  it("builds the first level from the learner's own answers only", () => {
    const board = createEmptyBoard("彩虹");
    const kick = note(board, [
      msg("user", kickoffPrompt("彩虹")),
      msg("assistant", "你对光的折射了解多少？"),
      msg("user", "知道光会折射，但不懂为什么分成七色"),
    ]);
    const answers = learnerAnswers(kick);
    expect(answers).toEqual(["知道光会折射，但不懂为什么分成七色"]);
    const prompt = firstLevelPrompt("彩虹", answers);
    expect(prompt).toContain("「知道光会折射，但不懂为什么分成七色」");
    expect(prompt).toContain("3–5 个按先后顺序");
    expect(firstLevelPrompt("彩虹", [])).toContain("按初学者处理");
    expect(firstLevelPrompt("彩虹", [])).toContain("3–5 个");
    expect(firstLevelPrompt("彩虹", [])).not.toContain("只给 3 个");
  });
  it("follows the tutor's outline when there is one", () => {
    const prompt = firstLevelPrompt("重疾险", [], ["保什么", "什么时候不赔"]);
    expect(prompt).toContain("必须按这份骨架拆");
    expect(prompt).toContain("1. 保什么；2. 什么时候不赔");
  });
});
