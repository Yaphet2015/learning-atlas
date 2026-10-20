import type { Board, ContextBundle } from "../shared/types";
import {
  aiOrganizationSchema,
  boardSchema,
  contextBundleSchema,
} from "../shared/validation";
import { cardReview } from "./card-review";
import { questionId } from "./kickoff";
import { newId } from "./boards";

/** Includes every depth and branch, without the note reference/outline budgets. */
export function organizationContext(board: Board): ContextBundle {
  return contextBundleSchema.parse({
    topic: board.topic,
    references: [],
    summary: "以最初起点为核心，回顾全画布。",
    review: {
      ...cardReview(
        board,
        board.nodes.map((node) => node.id),
      ),
      scope: "all",
      relations: board.relations,
    },
  });
}

/** Detect intervening AI completions before applying a revision of an older map. */
export function organizationSignature(board: Board): string {
  return JSON.stringify([board.topic, board.nodes, board.relations]);
}

export function applyOrganization(text: string, board: Board): Board {
  const result = aiOrganizationSchema.parse(JSON.parse(text));
  const ids = new Set(board.nodes.map((node) => node.id));
  const revised = new Map(result.nodes.map((node) => [node.id, node]));
  if (
    result.nodes.length !== ids.size ||
    revised.size !== ids.size ||
    result.nodes.some((node) => !ids.has(node.id))
  )
    throw new Error("整理结果未完整保留现有卡片，请重试。");
  const originId = questionId(board.nodes);
  const question = board.nodes.find((node) => node.id === originId);
  if (!question) throw new Error("找不到起点卡片。");
  if (
    result.nodes.some((node) =>
      node.id === question.id
        ? node.parentId !== null ||
          node.order !== 0 ||
          node.title !== question.title
        : node.parentId === null,
    )
  )
    throw new Error("整理结果必须以原起点为核心，请重试。");

  // Preserve learning evidence and identity; replace only the reviewed content/structure.
  const nodes = board.nodes.map((node) => {
    const { hints: _hints, visual: _visual, ...saved } = node;
    return { ...saved, ...revised.get(node.id)! };
  });
  const existingRelations = new Set(
    board.relations.map((relation) => relation.id),
  );
  const outputIds = new Set<string>();
  const relations = result.relations.map((relation) => {
    if (outputIds.has(relation.id))
      throw new Error("整理结果含重复关系，请重试。");
    outputIds.add(relation.id);
    return {
      ...relation,
      id: existingRelations.has(relation.id) ? relation.id : newId("relation"),
    };
  });
  const relationIds = new Set(relations.map((relation) => relation.id));
  const notes = board.notes.map((note) => {
    if (
      note.attachedTo?.kind !== "relation" ||
      relationIds.has(note.attachedTo.id)
    )
      return note;
    const { attachedTo: _attachment, ...saved } = note;
    return saved;
  });
  return boardSchema.parse({ ...board, nodes, relations, notes });
}
