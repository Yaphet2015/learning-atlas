import type { Board, CardReview, ConceptNode } from "../shared/types";
import { childrenGroups } from "../shared/tree";
import { questionId } from "./kickoff";

export const CARD_REVIEW_RADIUS = 4;

/**
 * Prepare a review locally, independently of outline and reference budgets: full cards of
 * the anchors' branches within four levels, not every card on those levels.
 */
export function cardReview(
  board: Board,
  focus: string[] = [],
  excludedRefs: string[] = [],
): CardReview {
  const children = childrenGroups(board.nodes);
  const ordered: { node: ConceptNode; level: number }[] = [];
  function visit(node: ConceptNode, level: number): void {
    ordered.push({ node, level });
    for (const child of children.get(node.id) ?? []) visit(child, level + 1);
  }
  for (const root of children.get(null) ?? []) visit(root, 0);
  const levels = new Map(ordered.map(({ node, level }) => [node.id, level]));
  const anchors = [...new Set(focus.filter((id) => levels.has(id)))];
  if (!anchors.length) {
    const question = questionId(board.nodes);
    if (question) anchors.push(question);
  }
  // Each anchor's branch: its ancestors, everything under its parent (itself, its
  // siblings and their subtrees) or under itself when it is a root, and the first level
  // under the question. Other branches reach the model as titles in the outline.
  const parents = new Map(board.nodes.map((n) => [n.id, n.parentId]));
  const inScope = new Set<string>();
  const addSubtree = (id: string) => {
    inScope.add(id);
    for (const child of children.get(id) ?? []) addSubtree(child.id);
  };
  for (const anchor of anchors) {
    const parent = parents.get(anchor) ?? null;
    addSubtree(parent ?? anchor);
    for (let up = parent; up; up = parents.get(up) ?? null) inScope.add(up);
  }
  const question = questionId(board.nodes);
  if (question) {
    inScope.add(question);
    for (const child of children.get(question) ?? []) inScope.add(child.id);
  }
  const anchorLevels = anchors.map((id) => levels.get(id)!);
  const excluded = new Set(excludedRefs);
  return {
    radius: CARD_REVIEW_RADIUS,
    anchors,
    nodes: ordered
      .filter(
        ({ node, level }) =>
          inScope.has(node.id) &&
          anchorLevels.some((d) => Math.abs(level - d) <= CARD_REVIEW_RADIUS),
      )
      .map(({ node, level }) => {
        const card: CardReview["nodes"][number] = {
          id: node.id,
          parentId: node.parentId,
          order: node.order,
          level,
          title: node.title,
          body: node.body,
        };
        if (excluded.has(`node:${node.id}`)) {
          card.body = "";
          card.bodyExcluded = true;
        } else {
          if (node.visual) card.visual = node.visual;
          for (const k of [
            "summary",
            "keyPoints",
            "whyItMatters",
            "example",
            "misconception",
            "depthType",
          ] as const)
            if (node[k] !== undefined) (card as any)[k] = node[k];
        }
        return card;
      }),
  };
}
