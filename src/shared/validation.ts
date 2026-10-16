import { z } from "zod";

/** These limits apply at every IPC and disk boundary, not only in the editor. */
export const LIMITS = {
  boardBytes: 8 * 1024 * 1024,
  nodes: 500,
  relations: 1_000,
  notes: 200,
  noteText: 20_000,
  messagesPerNote: 200,
  contextReferences: 20,
  contextCharacters: 20_000,
  prompt: 8_000,
} as const;

export const idSchema = z
  .string()
  .regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,95}$/, "Invalid identifier");
export const pointSchema = z
  .object({
    x: z.number().finite().min(-100_000).max(100_000),
    y: z.number().finite().min(-100_000).max(100_000),
  })
  .strict();
export const understandingSchema = z.enum(["unseen", "exploring", "explained"]);
export const colorSchema = z.enum(["sage", "blue", "peach", "lavender"]);
const timestampSchema = z.iso.datetime({ offset: true });
const nonemptyText = (max: number) =>
  z
    .string()
    .min(1)
    .max(max)
    .refine((value) => value.trim().length > 0, "Must not be blank");
const plainText = (max: number) =>
  nonemptyText(max).refine(
    (value) => !/<\/?[a-z][^>]*>/i.test(value) && !/```/.test(value),
    "Map content must be plain text, without HTML or code blocks",
  );
export const visualDiagramSchema = z
  .object({
    kind: z.enum(["process", "parts", "comparison"]),
    title: plainText(60).optional(),
    labels: z.array(plainText(32)).min(2).max(4),
    caption: plainText(120).optional(),
    basis: z.enum(["literal", "analogy"]),
  })
  .strict();
export const conceptNodeSchema = z
  .object({
    id: idSchema,
    kind: z.enum(["concept", "scene"]),
    title: nonemptyText(160),
    body: z.string().max(4_000),
    emoji: z.string().max(32),
    position: pointSchema,
    color: colorSchema,
    status: understandingSchema,
    expanded: z.boolean().optional(),
    visual: visualDiagramSchema.optional(),
  })
  .strict();
export const relationSchema = z
  .object({
    id: idSchema,
    source: idSchema,
    target: idSchema,
    label: z.string().max(200),
  })
  .strict();
export const chatMessageSchema = z
  .object({
    id: idSchema,
    role: z.enum(["user", "assistant"]),
    text: z.string().max(32_000),
    createdAt: timestampSchema,
  })
  .strict();
export const attachmentSchema = z
  .object({ kind: z.enum(["node", "relation"]), id: idSchema })
  .strict();
export const stickyNoteSchema = z
  .object({
    id: idSchema,
    title: z.string().max(160),
    text: z.string().max(LIMITS.noteText),
    position: pointSchema,
    attachedTo: attachmentSchema.optional(),
    messages: z.array(chatMessageSchema).max(LIMITS.messagesPerNote),
  })
  .strict();
export const sceneSchema = z
  .object({
    width: z.number().finite().min(80).max(600),
    color: z.string().regex(/^#[\da-fA-F]{6}$/),
    prediction: z.string().max(2_000),
    explanation: z.string().max(4_000),
    changed: z.enum(["width", "color"]).nullable(),
  })
  .strict();
export const boardSchema = z
  .object({
    version: z.literal(1),
    id: idSchema,
    title: nonemptyText(160),
    topic: nonemptyText(2_000),
    kind: z.enum(["walkthrough", "ai"]),
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
    nodes: z.array(conceptNodeSchema).max(LIMITS.nodes),
    relations: z.array(relationSchema).max(LIMITS.relations),
    notes: z.array(stickyNoteSchema).max(LIMITS.notes),
    scene: sceneSchema,
    viewport: z
      .object({
        x: z.number().finite().min(-1_000_000).max(1_000_000),
        y: z.number().finite().min(-1_000_000).max(1_000_000),
        zoom: z.number().finite().min(0.05).max(4),
      })
      .strict()
      .optional(),
  })
  .strict()
  .superRefine((board, ctx) => {
    const ids = new Set<string>();
    for (const [type, entries] of [
      ["nodes", board.nodes],
      ["relations", board.relations],
      ["notes", board.notes],
    ] as const) {
      entries.forEach((entry, index) => {
        if (ids.has(entry.id))
          ctx.addIssue({
            code: "custom",
            path: [type, index, "id"],
            message: "Duplicate board identifier",
          });
        ids.add(entry.id);
      });
    }
    const nodeIds = new Set(board.nodes.map((node) => node.id));
    const relationIds = new Set(board.relations.map((relation) => relation.id));
    board.relations.forEach((relation, index) => {
      if (!nodeIds.has(relation.source) || !nodeIds.has(relation.target)) {
        ctx.addIssue({
          code: "custom",
          path: ["relations", index],
          message: "Relation endpoint does not exist",
        });
      }
      if (relation.source === relation.target)
        ctx.addIssue({
          code: "custom",
          path: ["relations", index],
          message: "A relation must connect different nodes",
        });
    });
    board.notes.forEach((note, index) => {
      if (
        note.attachedTo &&
        !(note.attachedTo.kind === "node" ? nodeIds : relationIds).has(
          note.attachedTo.id,
        )
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["notes", index, "attachedTo"],
          message: "Note attachment does not exist",
        });
      }
      const messageIds = new Set<string>();
      note.messages.forEach((message, messageIndex) => {
        if (messageIds.has(message.id))
          ctx.addIssue({
            code: "custom",
            path: ["notes", index, "messages", messageIndex, "id"],
            message: "Duplicate message identifier",
          });
        messageIds.add(message.id);
      });
    });
  });
export const boardSummarySchema = z
  .object({
    id: idSchema,
    title: nonemptyText(160),
    kind: z.enum(["walkthrough", "ai"]),
    updatedAt: timestampSchema,
  })
  .strict();
export const contextReferenceSchema = z
  .object({
    id: idSchema,
    kind: z.enum(["topic", "node", "relation", "note"]),
    title: z.string().max(160),
    text: z.string().max(3_000),
  })
  .strict();
export const contextBundleSchema = z
  .object({
    topic: z.string().max(2_000),
    references: z.array(contextReferenceSchema).max(LIMITS.contextReferences),
    summary: z.string().max(LIMITS.contextCharacters),
  })
  .strict()
  .refine(
    (context) =>
      context.references.reduce(
        (sum, item) => sum + item.text.length + item.title.length,
        context.topic.length,
      ) <= LIMITS.contextCharacters,
    "Context is too large",
  );
export const aiRequestSchema = z
  .object({
    boardId: idSchema,
    stickyId: idSchema,
    requestId: idSchema,
    prompt: nonemptyText(LIMITS.prompt),
    context: contextBundleSchema,
    mode: z.enum(["answer", "map", "expand"]),
  })
  .strict();
export const baseUrlSchema = z
  .string()
  .max(2_048)
  .url()
  .refine((value) => {
    try {
      const url = new URL(value);
      const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
      return (
        !url.username &&
        !url.password &&
        !url.search &&
        !url.hash &&
        (url.protocol === "https:" || (url.protocol === "http:" && local))
      );
    } catch {
      return false;
    }
  }, "Use HTTPS, or HTTP on localhost, without credentials, query parameters, or fragments");
export const settingsSchema = z
  .object({
    model: nonemptyText(160).refine(
      (value) => !/[\r\n\u0000]/.test(value),
      "Invalid model name",
    ),
    baseUrl: baseUrlSchema,
    apiKey: z
      .string()
      .max(4_096)
      .refine((value) => !/[\r\n\u0000]/.test(value), "Invalid API key")
      .optional(),
  })
  .strict();
export const aiSettingsInputSchema = settingsSchema;
export const selectionSchema = z
  .object({ kind: z.enum(["node", "relation", "note"]), id: idSchema })
  .strict()
  .nullable();

export const aiMapSchema = z
  .object({
    nodes: z
      .array(
        z
          .object({
            id: idSchema,
            title: plainText(100),
            body: plainText(1_200),
            emoji: z.string().max(16).optional(),
            color: colorSchema.optional(),
            visual: visualDiagramSchema.optional(),
          })
          .strict(),
      )
      .min(1)
      .max(6),
    relations: z
      .array(
        z
          .object({
            source: idSchema,
            target: idSchema,
            label: plainText(120),
          })
          .strict(),
      )
      .max(12),
  })
  .strict();
