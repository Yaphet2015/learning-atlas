import type { Board, StickyNote } from "../shared/types";

/** Top-level cards, left to right. A board can grow several roots side by side. */
export const rootsOf = <T extends { parentId: string | null; order: number }>(
  nodes: T[],
): T[] =>
  nodes.filter((n) => n.parentId === null).sort((a, b) => a.order - b.order);
/** The primary root: the leftmost top-level card. */
export const rootOf = (board: Board) => rootsOf(board.nodes)[0];
/** The board's question card: the node marked `question`, else the leftmost root (older boards). */
export function questionId<
  T extends {
    id: string;
    parentId: string | null;
    order: number;
    question?: boolean;
  },
>(nodes: T[]): string | undefined {
  return (nodes.find((n) => n.question) ?? rootsOf(nodes)[0])?.id;
}
/**
 * A root that shows the board's topic. Roots grown later (above or beside it) and cards
 * promoted to roots show their own title.
 */
export function isQuestionRoot<
  T extends {
    id: string;
    parentId: string | null;
    order: number;
    question?: boolean;
  },
>(nodes: T[], n: T): boolean {
  return n.parentId === null && n.id === questionId(nodes);
}

/** An AI board whose root question has no children yet: the user needs an obvious next step. */
export function needsKickoff(board: Board | null | undefined): boolean {
  if (!board || board.kind !== "ai") return false;
  const root = rootOf(board);
  return Boolean(root) && !board.nodes.some((n) => n.parentId === root!.id);
}

/** The drawer conversation attached to the root question, if any. */
export function kickoffNote(board: Board): StickyNote | undefined {
  const root = rootOf(board);
  return root
    ? board.notes.find(
        (n) => n.attachedTo?.kind === "node" && n.attachedTo.id === root.id,
      )
    : undefined;
}

export const KICKOFF_MESSAGE = "我想从这里开始学，带我起步吧。";

/**
 * Sent in answer mode. Shown in the thread as the learner's own short line; the
 * instructions after it ask the tutor to probe prior knowledge first.
 */
export function kickoffPrompt(topic: string): string {
  return `${KICKOFF_MESSAGE}
我的起点问题是：「${topic}」。
请先别讲解。用 1–2 个简短、具体的问题问我对它已经知道些什么、想弄懂到什么程度；再用一句话说明我们接下来会先把它拆成哪几个按先后顺序的子问题。`;
}

/** What the learner said in the kickoff conversation (their own replies, not the kickoff line). */
export function learnerAnswers(note: StickyNote | undefined): string[] {
  return (note?.messages ?? [])
    .filter((m) => m.role === "user" && !m.text.startsWith(KICKOFF_MESSAGE))
    .map((m) => m.text.trim())
    .filter(Boolean)
    .slice(-3);
}

/**
 * Map-mode prompt for the first level of child questions, informed by the
 * learner's answers. With an outline (the numbered skeleton the tutor already
 * gave), the level must follow it so the canvas matches the drawer.
 */
export function firstLevelPrompt(
  topic: string,
  answers: string[],
  outline?: string[],
): string {
  const known = answers.length
    ? `学习者说自己已经知道 / 想弄懂的是：${answers.map((a) => `「${a.slice(0, 300)}」`).join("；")}。据此跳过他已掌握的部分，从他的起点往下拆。`
    : "学习者还没说自己知道什么，按初学者处理。";
  const skeleton = outline?.length
    ? `\n必须按这份骨架拆，一项一个子问题，顺序不变：${outline.map((h, i) => `${i + 1}. ${h.slice(0, 60)}`).join("；")}。`
    : "";
  return `为这个问题创建学习地图的第一层：「${topic}」。${known}${skeleton}
给 3–5 个按先后顺序（先→后）排列、彼此并列不重叠、合起来覆盖整个问题的子问题，每个标题写成一个具体的小问题，正文一两句说明为什么先问它。具体、直观、少文字。`;
}

/** The thread shows only the learner-facing line of the kickoff request. */
export const displayMessage = (role: "user" | "assistant", text: string) =>
  role === "user" && text.startsWith(KICKOFF_MESSAGE) ? KICKOFF_MESSAGE : text;
