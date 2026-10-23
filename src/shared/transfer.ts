import { z } from "zod";
import type { Board, ChatMessage } from "./types.js";
import {
  safeParseBoard,
  boardSchema,
  chatMessageSchema,
  idSchema,
  LIMITS,
} from "./validation.js";

export const TRANSFER_BYTES = 64 * 1024 * 1024;
// Complete transcripts can contain answers longer than the renderer's 32K cache.
export const transferMessageSchema = chatMessageSchema.extend({
  text: z.string().max(TRANSFER_BYTES),
});
export const conversationTransferSchema = z
  .object({
    noteId: idSchema,
    messages: z.array(transferMessageSchema).max(100_000),
  })
  .strict();
export const boardTransferSchema = z
  .object({
    format: z.literal("studyboard"),
    version: z.literal(1),
    exportedAt: z.iso.datetime({ offset: true }),
    board: boardSchema,
    conversations: z.array(conversationTransferSchema).max(LIMITS.notes),
  })
  .strict()
  .superRefine((value, ctx) => {
    const notes = new Set(value.board.notes.map((note) => note.id));
    const seen = new Set<string>();
    for (const conversation of value.conversations) {
      if (!notes.has(conversation.noteId) || seen.has(conversation.noteId))
        ctx.addIssue({ code: "custom", message: "对话归属无效或重复。" });
      seen.add(conversation.noteId);
      const ids = new Set<string>();
      for (const message of conversation.messages) {
        if (ids.has(message.id))
          ctx.addIssue({ code: "custom", message: "对话消息编号重复。" });
        ids.add(message.id);
      }
    }
    if (seen.size !== notes.size)
      ctx.addIssue({ code: "custom", message: "缺少画板对话。" });
  });
export type BoardTransfer = z.infer<typeof boardTransferSchema>;
export type ExportFormat = "data" | "markdown" | "png";

export const EXPORT_FORMATS = {
  data: {
    name: "Studyboard 学习数据",
    extension: "json",
    suffix: "studyboard.json",
    mimeType: "application/json;charset=utf-8",
  },
  markdown: {
    name: "Markdown",
    extension: "md",
    suffix: "md",
    mimeType: "text/markdown;charset=utf-8",
  },
  png: {
    name: "PNG 图片",
    extension: "png",
    suffix: "png",
    mimeType: "image/png",
  },
} satisfies Record<
  ExportFormat,
  { name: string; extension: string; suffix: string; mimeType: string }
>;

export function checkTransferSize(text: string): void {
  if (new TextEncoder().encode(text).byteLength > TRANSFER_BYTES)
    throw new Error("文件超过 64 MB，请缩小画板后重试。");
}

export function parseBoardTransfer(text: string): BoardTransfer {
  checkTransferSize(text);
  let input: unknown;
  try {
    input = JSON.parse(text);
  } catch {
    throw new Error("无法读取数据文件：JSON 格式无效。");
  }
  // Older exports carry an older board version; upgrade it like a board from disk.
  if (input && typeof input === "object" && "board" in input) {
    const board = safeParseBoard((input as { board: unknown }).board);
    if (board.success) input = { ...input, board: board.data };
  }
  const result = boardTransferSchema.safeParse(input);
  if (!result.success)
    throw new Error("无法导入：文件格式、版本或画板内容不符合要求。");
  return result.data;
}

/** Preserve cache-only edits and metadata while using the complete durable transcript. */
export function completeMessages(
  cached: ChatMessage[],
  history: ChatMessage[],
): ChatMessage[] {
  const key = (m: ChatMessage) => `${m.role}\u0000${m.text.slice(0, 32_000)}`;
  const byId = new Map(cached.map((m) => [m.id, m]));
  const byText = new Map(cached.map((m) => [key(m), m]));
  const durableIds = new Set(history.map((m) => m.id));
  const durableText = new Set(history.map(key));
  return [
    ...history.map((m) => {
      const meta = (byId.get(m.id) ?? byText.get(key(m)))?.meta;
      return meta ? { ...m, meta } : m;
    }),
    ...cached.filter((m) => !durableIds.has(m.id) && !durableText.has(key(m))),
  ];
}

/**
 * What leaves the app: the board without internal card data. node.meta holds the new-knowledge
 * gate's working fields (newIdea, substance, addsBeyond, claims, scores) and check marking keys;
 * none of it is ever rendered or exported.
 */
export function publicBoard(board: Board): Board {
  const strip = <T extends { meta?: unknown }>(n: T): T => {
    const { meta: _meta, ...rest } = n;
    return rest as T;
  };
  return {
    ...board,
    nodes: board.nodes.map(strip),
    ...(board.cardArchives
      ? { cardArchives: board.cardArchives.map((a) => ({ ...a, node: strip(a.node) })) }
      : {}),
  };
}

export async function collectBoardTransfer(
  input: Board,
  getHistory: (
    boardId: string,
    noteId: string,
  ) => Promise<{ messages: ChatMessage[]; running: boolean }>,
): Promise<BoardTransfer> {
  const board = publicBoard(boardSchema.parse(input));
  const conversations: BoardTransfer["conversations"] = [];
  for (const note of board.notes) {
    const history = await getHistory(board.id, note.id);
    if (history.running)
      throw new Error("对话尚未结束，请等待回答完成或停止回答后再导出。");
    conversations.push({
      noteId: note.id,
      messages: completeMessages(note.messages, history.messages),
    });
  }
  const result = boardTransferSchema.parse({
    format: "studyboard",
    version: 1,
    exportedAt: new Date().toISOString(),
    board,
    conversations,
  });
  checkTransferSize(JSON.stringify(result));
  return result;
}

/** Only the board identity changes; all references inside the board stay connected. */
export function importedBoard(transfer: BoardTransfer): Board {
  const histories = new Map(
    transfer.conversations.map((c) => [c.noteId, c.messages]),
  );
  return boardSchema.parse({
    ...transfer.board,
    id: `board_${crypto.randomUUID()}`,
    updatedAt: new Date().toISOString(),
    notes: transfer.board.notes.map((note) => ({
      ...note,
      messages: histories
        .get(note.id)!
        .slice(-LIMITS.messagesPerNote)
        .map((m) => ({ ...m, text: m.text.slice(0, 32_000) })),
    })),
  });
}

export function exportFilename(title: string, format: ExportFormat): string {
  const stem =
    title
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
      .trim()
      .replace(/[. ]+$/g, "")
      .slice(0, 80) || "学习画板";
  return `${stem}.${EXPORT_FORMATS[format].suffix}`;
}

function text(value: string): string {
  return value.replace(/([\\`*_{}\[\]<>#+!|])/g, "\\$1");
}
function line(value: string): string {
  return text(value).replace(/[\r\n]+/g, " ");
}
const status = { unseen: "待探索", exploring: "探索中", explained: "我能解释" };

export function transferMarkdown(transfer: BoardTransfer): string {
  const { board } = transfer;
  const out = [
    `# ${line(board.title)}`,
    "",
    `学习主题：${text(board.topic)}`,
    "",
    `创建时间：${board.createdAt}`,
    `导出时间：${transfer.exportedAt}`,
    "",
    "## 知识地图",
    "",
  ];
  const walk = (parentId: string | null, path: string) => {
    board.nodes
      .filter((n) => n.parentId === parentId)
      .sort((a, b) => a.order - b.order)
      .forEach((n, index) => {
        const number = path ? `${path}.${index + 1}` : `${index + 1}`;
        out.push(
          `### ${number} ${line(n.title)}`,
          "",
          `理解进度：${status[n.status]}`,
          "",
          text(n.body),
          "",
        );
        if (n.check?.q) out.push(`检查题：${text(n.check.q)}`, "");
        if (n.hand) out.push(`我的批注：${text(n.hand)}`, "");
        if (n.visual)
          out.push(
            `图示（${n.visual.basis === "analogy" ? "类比" : "直接描述"}）：${line(n.visual.title ?? n.title)}`,
            "",
            n.visual.labels
              .map(text)
              .join(n.visual.kind === "process" ? " → " : " / "),
            "",
            text(n.visual.caption ?? ""),
            "",
          );
        walk(n.id, number);
      });
  };
  walk(null, "");
  if (board.relations.length) {
    const titles = new Map(board.nodes.map((n) => [n.id, n.title]));
    out.push("## 跨概念关系", "");
    for (const r of board.relations)
      out.push(
        `- ${line(titles.get(r.source)!)} → ${line(titles.get(r.target)!)}：${line(r.label)}`,
      );
    out.push("");
  }
  if (board.kind === "walkthrough")
    out.push(
      "## 演练记录",
      "",
      `宽度：${board.scene.width}；颜色：${board.scene.color}`,
      "",
      `我的预测：${text(board.scene.prediction)}`,
      "",
      `我的解释：${text(board.scene.explanation)}`,
      "",
    );
  const histories = new Map(
    transfer.conversations.map((c) => [c.noteId, c.messages]),
  );
  out.push("## 批注与完整对话", "");
  for (const note of board.notes) {
    out.push(`### ${line(note.title || "我的问题")}`, "");
    if (note.attachedTo) {
      const at = note.attachedTo;
      const label =
        at.kind === "node"
          ? board.nodes.find((n) => n.id === at.id)?.title
          : board.relations.find((r) => r.id === at.id)?.label;
      out.push(
        `关联${at.kind === "node" ? "卡片" : "关系"}：${line(label ?? "")}`,
        "",
      );
    }
    if (note.contextCards?.length)
      out.push(
        `参考卡片：${note.contextCards.map((id) => line(board.nodes.find((n) => n.id === id)?.title ?? id)).join("、")}`,
        "",
      );
    if (note.text) out.push(text(note.text), "");
    for (const m of histories.get(note.id) ?? []) {
      out.push(
        `#### ${m.role === "user" ? "我" : "AI"} · ${m.createdAt}`,
        "",
        text(m.text),
        "",
      );
      if (m.meta?.checked?.length)
        out.push(
          `已勾选练习项：${m.meta.checked.map((i) => i + 1).join("、")}`,
          "",
        );
      if (m.meta?.laid) out.push("已加入知识地图。", "");
    }
  }
  if (board.cardArchives?.length) {
    out.push("## 可恢复的源卡片", "");
    for (const archive of board.cardArchives) {
      out.push(
        `### ${line(archive.node.title)}`,
        "",
        text(archive.node.body),
        "",
        `移除原因：${text(archive.reason)}`,
        "",
        `原学习状态：${archive.node.status}`,
        "",
      );
      if (archive.node.hand) out.push(`原批注：${text(archive.node.hand)}`, "");
      if (archive.mergedInto)
        out.push(
          `合并目标：${line(board.nodes.find((node) => node.id === archive.mergedInto)?.title ?? archive.mergedInto)}`,
          "",
        );
    }
  }
  return out.join("\n");
}
