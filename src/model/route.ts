import type { Board, ConceptNode } from "../shared/types";
import { questionNode } from "../shared/canvas";

/** The learning path's stations in order: board.route if set, else the first level under the question. */
export function routeOf(board: Board): ConceptNode[] {
  const byId = new Map(board.nodes.map((n) => [n.id, n]));
  if (board.route?.length)
    return board.route.map((id) => byId.get(id)).filter((n): n is ConceptNode => !!n);
  return [];
}
/** The order a route would get from the cards already there (old maps: 帮我排一条路线). */
export function defaultRoute(board: Board): string[] {
  const root = questionNode(board);
  return board.nodes
    .filter((n) => root && n.parentId === root.id)
    .sort((a, b) => a.order - b.order)
    .map((n) => n.id);
}
/** 1-based station number of a card, or undefined when it is not on the route. */
export function stationOf(board: Board, id: string): number | undefined {
  const i = (board.route ?? []).indexOf(id);
  return i < 0 ? undefined : i + 1;
}
export const sealed = (n: ConceptNode) => n.status === "explained";
