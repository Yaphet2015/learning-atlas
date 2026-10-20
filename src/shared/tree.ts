import type { ConceptNode } from "./types.js";

/** Nodes grouped by parent; each sibling list is in 先→后 order. */
export function childrenGroups(
  nodes: ConceptNode[],
): Map<string | null, ConceptNode[]> {
  const groups = new Map<string | null, ConceptNode[]>();
  for (const node of nodes) {
    const group = groups.get(node.parentId) ?? [];
    group.push(node);
    groups.set(node.parentId, group);
  }
  for (const group of groups.values()) group.sort((a, b) => a.order - b.order);
  return groups;
}
