import type { Board, CardReview, ConceptNode } from "../shared/types";
import { childrenGroups } from "../shared/tree";
import { questionId } from "./kickoff";

export const CARD_REVIEW_RADIUS = 4;

/** Prepare a review locally, independently of outline and reference budgets. */
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
  const anchorLevels = anchors.map((id) => levels.get(id)!);
  const excluded = new Set(excludedRefs);
  return {
    radius: CARD_REVIEW_RADIUS,
    anchors,
    nodes: ordered
      .filter(({ level }) =>
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
        } else if (node.visual) {
          card.visual = node.visual;
        }
        return card;
      }),
  };
}
