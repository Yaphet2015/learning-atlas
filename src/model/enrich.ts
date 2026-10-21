import { z } from "zod";
import type { Board, ContextBundle } from "../shared/types";
import {
  aiOverviewsSchema,
  idSchema,
  visualDiagramSchema,
} from "../shared/validation";
import { applyOverviews } from "./overview";

/**
 * Follow-up to a map/expand generation: diagrams for the new cards and zoomed-out
 * topic overviews. Kept out of the generation prompt so that call spends its attention
 * on the cards' content.
 */
export function enrichPrompt(board: Board, ids: string[]): string {
  const cards = ids
    .map((id) => board.nodes.find((n) => n.id === id))
    .filter((n) => !!n)
    .map((n) => `- [id:${n.id}] ${n.title}：${n.body}`);
  return `这批卡片刚加入画布。只在确实有助于理解时给它们配图示，并为它们所在的主题分支写概览：\n${cards.join("\n")}`;
}

const enrichSchema = z
  .object({
    visuals: z
      .array(z.object({ id: idSchema, visual: visualDiagramSchema }).strict())
      .max(12)
      .optional()
      .catch(undefined),
    overviews: aiOverviewsSchema,
  })
  .strip();

/**
 * Apply an enrich reply. Diagrams go only to the listed new cards that still have none;
 * overviews follow the same staleness rules as before (any edited source drops them).
 * Malformed replies leave the board unchanged: this is optional decoration.
 */
export function applyEnrichment(
  text: string,
  board: Board,
  ids: string[],
  context?: ContextBundle,
): Board {
  let raw = text.trim();
  const fenced = /^```(?:json)?\s*\n?([\s\S]*?)\n?```\s*$/i.exec(raw);
  if (fenced) raw = fenced[1].trim();
  let parsed: z.infer<typeof enrichSchema>;
  try {
    const result = enrichSchema.safeParse(JSON.parse(raw));
    if (!result.success) return board;
    parsed = result.data;
  } catch {
    return board;
  }
  if (context && context.topic !== board.topic) return board;
  const allowed = new Set(ids);
  const visuals = new Map<string, z.infer<typeof visualDiagramSchema>>();
  for (const item of parsed.visuals ?? [])
    if (allowed.has(item.id) && !visuals.has(item.id))
      visuals.set(item.id, item.visual);
  const drawn: Board = visuals.size
    ? {
        ...board,
        nodes: board.nodes.map((n) => {
          const visual = visuals.get(n.id);
          return visual && !n.visual
            ? { ...n, visual: { ...visual, labels: [...visual.labels] } }
            : n;
        }),
      }
    : board;
  const identity = new Map(board.nodes.map((n) => [n.id, n.id]));
  return applyOverviews(
    drawn,
    board,
    parsed.overviews,
    identity,
    context?.review,
  );
}
