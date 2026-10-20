import { z } from "zod";
import type { Board, ConceptNode } from "./types.js";
import { childrenGroups } from "./tree.js";
import {
  boardSchema,
  idSchema,
  visualDiagramSchema,
  LIMITS,
} from "./validation.js";

const fields = z
  .object({
    title: z.string().trim().min(1).max(160).optional(),
    body: z.string().max(4000).optional(),
    visual: visualDiagramSchema.nullable().optional(),
  })
  .strict();
export const canvasOperationSchema = z.discriminatedUnion("op", [
  z
    .object({
      op: z.literal("create"),
      id: idSchema,
      parentId: idSchema.nullable(),
      title: z.string().min(1).max(160),
      body: z.string().max(4000),
      order: z.number().int().min(0).max(500).optional(),
    })
    .strict(),
  z.object({ op: z.literal("update"), id: idSchema, ...fields.shape }).strict(),
  z
    .object({
      op: z.literal("move"),
      id: idSchema,
      parentId: idSchema.nullable(),
      order: z.number().int().min(0).max(500),
    })
    .strict(),
  z
    .object({
      op: z.literal("delete"),
      id: idSchema,
      reason: z.string().min(1).max(500),
    })
    .strict(),
  z
    .object({
      op: z.literal("merge"),
      id: idSchema,
      targetId: idSchema,
      reason: z.string().min(1).max(500),
    })
    .strict(),
  z
    .object({
      op: z.literal("relate"),
      id: idSchema,
      source: idSchema,
      target: idSchema,
      label: z.string().min(1).max(200),
    })
    .strict(),
  z.object({ op: z.literal("unrelate"), id: idSchema }).strict(),
  z.object({ op: z.literal("restore"), id: idSchema }).strict(),
]);
export type CanvasOperation = z.infer<typeof canvasOperationSchema>;
export const canvasEditsSchema = z.array(canvasOperationSchema).min(1).max(20);

export function questionNode(board: Board): ConceptNode | undefined {
  return (
    board.nodes.find((n) => n.question) ??
    board.nodes
      .filter((n) => n.parentId === null)
      .sort((a, b) => a.order - b.order)[0]
  );
}
export function cardVersion(node: ConceptNode): string {
  return JSON.stringify([
    node.id,
    node.title,
    node.body,
    node.parentId,
    node.order,
    node.visual ?? null,
  ]);
}
/** Equality token, not a hash: no collision can hide an intervening graph change. */
export function canvasFingerprint(board: Board): string {
  return JSON.stringify([
    board.topic,
    board.nodes.map(cardVersion),
    board.relations,
    board.cardArchives ?? [],
  ]);
}
function normalize(nodes: ConceptNode[]): void {
  for (const group of childrenGroups(nodes).values())
    group.forEach((node, index) => (node.order = index));
}
function insert(
  nodes: ConceptNode[],
  node: ConceptNode,
  parentId: string | null,
  order: number,
): void {
  for (const other of nodes)
    if (
      other.id !== node.id &&
      other.parentId === parentId &&
      other.order >= order
    )
      other.order++;
  node.parentId = parentId;
  node.order = order;
}

/** All graph edits are validated together, including moves that exchange hierarchy. */
export function applyCanvasEdits(
  board: Board,
  input: unknown,
  runId: string,
  timestamp: string,
  excluded: string[] = [],
): Board {
  if (JSON.stringify(input).length > 16000)
    throw new Error("本批修改超过 16000 字符，请拆分。");
  const operations = canvasEditsSchema.parse(input);
  const next = structuredClone(board);
  const origin = questionNode(board);
  const protectedIds = new Set(excluded);
  const get = (id: string) => {
    const node = next.nodes.find((n) => n.id === id);
    if (!node) throw new Error(`找不到卡片 ${id}。`);
    if (protectedIds.has(id)) throw new Error(`卡片 ${id} 未纳入本轮资料。`);
    return node;
  };
  const detachRelation = (id: string) => {
    next.relations = next.relations.filter((r) => r.id !== id);
    for (const note of next.notes)
      if (note.attachedTo?.kind === "relation" && note.attachedTo.id === id)
        delete note.attachedTo;
  };
  for (const operation of operations) {
    if (operation.op === "relate") {
      get(operation.source);
      get(operation.target);
      next.relations = next.relations.filter((r) => r.id !== operation.id);
      next.relations.push({
        id: operation.id,
        source: operation.source,
        target: operation.target,
        label: operation.label,
        kind: "cross",
      });
      continue;
    }
    if (operation.op === "unrelate") {
      const relation = next.relations.find((r) => r.id === operation.id);
      if (relation) {
        get(relation.source);
        get(relation.target);
      }
      detachRelation(operation.id);
      continue;
    }
    if (operation.op === "restore") {
      const entry = next.cardArchives?.find((a) => a.id === operation.id);
      if (!entry) throw new Error("找不到源记录。");
      if (next.nodes.some((n) => n.id === entry.node.id))
        throw new Error("原卡片已存在。");
      const node = structuredClone(entry.node);
      if (node.parentId && !next.nodes.some((n) => n.id === node.parentId))
        node.parentId = null;
      next.nodes.push(node);
      for (const binding of entry.children ?? []) {
        const child = next.nodes.find((n) => n.id === binding.id);
        if (
          child &&
          child.parentId === (entry.mergedInto ?? entry.node.parentId)
        ) {
          child.parentId = node.id;
          child.order = binding.order;
        }
      }
      for (const r of entry.relations)
        if (
          next.nodes.some((n) => n.id === r.source) &&
          next.nodes.some((n) => n.id === r.target) &&
          !next.relations.some((e) => e.id === r.id)
        )
          next.relations.push(structuredClone(r));
      for (const binding of entry.noteBindings) {
        const note = next.notes.find((n) => n.id === binding.id);
        if (!note) continue;
        if (
          binding.attachedTo &&
          (binding.attachedTo.kind === "node"
            ? next.nodes
            : next.relations
          ).some((n) => n.id === binding.attachedTo!.id)
        )
          note.attachedTo = structuredClone(binding.attachedTo);
        note.contextCards = binding.contextCards?.filter((id) =>
          next.nodes.some((n) => n.id === id),
        );
      }
      next.cardArchives = next.cardArchives!.filter((a) => a.id !== entry.id);
      continue;
    }
    if (operation.op === "create") {
      if (
        next.nodes.some((n) => n.id === operation.id) ||
        next.cardArchives?.some((a) => a.node.id === operation.id)
      )
        throw new Error("卡片 ID 已存在，请使用新的 ID。");
      if (operation.parentId) get(operation.parentId);
      const node: ConceptNode = {
        id: operation.id,
        kind: "concept",
        title: operation.title,
        body: operation.body,
        parentId: operation.parentId,
        order:
          operation.order ??
          next.nodes.filter((n) => n.parentId === operation.parentId).length,
        status: "unseen",
      };
      insert(next.nodes, node, node.parentId, node.order);
      next.nodes.push(node);
      continue;
    }
    const node = get(operation.id);
    if (operation.op === "update") {
      if (
        node.id === origin?.id &&
        operation.title !== undefined &&
        operation.title !== origin.title
      )
        throw new Error("请保留最初起点的标题与身份。");
      if (operation.title !== undefined) node.title = operation.title;
      if (operation.body !== undefined) node.body = operation.body;
      if (operation.visual === null) delete node.visual;
      else if (operation.visual !== undefined) node.visual = operation.visual;
    } else if (operation.op === "move") {
      if (operation.parentId) get(operation.parentId);
      insert(next.nodes, node, operation.parentId, operation.order);
    } else {
      if (node.id === origin?.id)
        throw new Error("不能删除或合并最初的起点卡片。");
      const target =
        operation.op === "merge" ? get(operation.targetId) : undefined;
      if (target?.id === node.id) throw new Error("不能合并到自身。");
      const incident = next.relations.filter(
        (r) => r.source === node.id || r.target === node.id,
      );
      next.cardArchives ??= [];
      let archiveIndex = next.cardArchives.length;
      const archivePrefix = `archive-${runId.slice(0, 55)}-${node.id.slice(0, 20)}`;
      while (
        next.cardArchives.some(
          (a) => a.id === `${archivePrefix}-${archiveIndex}`,
        )
      )
        archiveIndex++;
      next.cardArchives.push({
        id: `${archivePrefix}-${archiveIndex}`,
        runId,
        reason: operation.reason,
        node: structuredClone(node),
        relations: structuredClone(incident),
        children: next.nodes
          .filter((n) => n.parentId === node.id)
          .map(({ id, parentId, order }) => ({ id, parentId, order })),
        noteBindings: next.notes
          .filter(
            (n) =>
              n.attachedTo?.id === node.id ||
              incident.some((r) => r.id === n.attachedTo?.id) ||
              n.contextCards?.includes(node.id),
          )
          .map((n) => ({
            id: n.id,
            ...(n.attachedTo
              ? { attachedTo: structuredClone(n.attachedTo) }
              : {}),
            ...(n.contextCards ? { contextCards: [...n.contextCards] } : {}),
          })),
        ...(target ? { mergedInto: target.id } : {}),
        createdAt: timestamp,
      });
      const children = next.nodes.filter((n) => n.parentId === node.id);
      for (const child of children) {
        child.parentId = target?.id ?? node.parentId;
        child.order = target
          ? next.nodes.filter(
              (n) => n.parentId === target.id && n.id !== child.id,
            ).length
          : node.order + child.order / 1000;
      }
      for (const note of next.notes) {
        if (
          note.attachedTo?.kind === "node" &&
          note.attachedTo.id === node.id
        ) {
          if (target) note.attachedTo.id = target.id;
          else delete note.attachedTo;
        }
        if (note.contextCards?.includes(node.id))
          note.contextCards = [
            ...new Set(
              note.contextCards.flatMap((id) => {
                if (id !== node.id) return [id];
                return target ? [target.id] : [];
              }),
            ),
          ];
        if (target && note.excludedRefs?.includes(`node:${node.id}`))
          note.excludedRefs = [
            ...new Set([...note.excludedRefs, `node:${target.id}`]),
          ];
      }
      next.nodes = next.nodes.filter((n) => n.id !== node.id);
      if (target) {
        for (const r of incident) {
          if (r.source === node.id) r.source = target.id;
          if (r.target === node.id) r.target = target.id;
        }
        const seen = new Set<string>();
        for (const r of [...next.relations]) {
          const key = JSON.stringify([r.source, r.target, r.label]);
          if (r.source === r.target || seen.has(key)) detachRelation(r.id);
          else seen.add(key);
        }
      } else for (const r of incident) detachRelation(r.id);
    }
  }
  // Root identity survives a move above/beside the original question.
  if (origin) {
    const node = next.nodes.find((n) => n.id === origin.id);
    if (node) node.question = true;
  }
  normalize(next.nodes);
  for (const node of next.nodes) {
    delete node.hints;
    delete node.overview;
  }
  for (const id of protectedIds) {
    const before = board.nodes.find((n) => n.id === id);
    const after = next.nodes.find((n) => n.id === id);
    if (
      (before ? cardVersion(before) : "") !== (after ? cardVersion(after) : "")
    )
      throw new Error(`卡片 ${id} 未纳入本轮资料，不能修改相关内容或层级。`);
  }
  if (
    new TextEncoder().encode(JSON.stringify(next)).byteLength >
    LIMITS.boardBytes
  )
    throw new Error("画布及源记录超过存储上限，请减少本批修改。");
  const result = boardSchema.parse(next);
  if (!result.nodes.length) throw new Error("画布至少需要保留一个起点。");
  return result;
}

/** Apply the operation log to current notes, so concurrent conversations are preserved. */
export function mergeCanvasDraft(
  current: Board,
  operations: CanvasOperation[][],
  runId: string,
  timestamp: string,
): Board {
  let next = current;
  for (const batch of operations)
    next = applyCanvasEdits(next, batch, runId, timestamp);
  return next;
}
