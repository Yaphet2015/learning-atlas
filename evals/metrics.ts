/** Cheap, deterministic metrics over a generated tree. No model calls. */
export interface EvalNode {
  id: string;
  parentId: string | null;
  title: string;
  body: string;
  level: number;
}

const norm = (s: string) => s.toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, "");

/** Character bigrams: a language-neutral proxy for wording overlap in Chinese. */
export function bigrams(s: string): Set<string> {
  const t = [...norm(s)];
  const out = new Set<string>();
  for (let i = 0; i < t.length - 1; i++) out.add(t[i] + t[i + 1]);
  if (t.length === 1) out.add(t[0]);
  return out;
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size && !b.size) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

export const DUP_THRESHOLD = 0.5;

export interface TreeMetrics {
  nodes: number;
  byLevel: Record<number, number>;
  avgBodyChars: Record<number, number>;
  titlePairs: { mean: number; max: number; dupRate: number };
  textPairs: { mean: number; max: number; dupRate: number };
  nearDuplicates: { a: string; b: string; sim: number }[];
  /** Per level ≥2: share of a card's bigrams not already in its ancestors' or siblings' text. */
  newInfoRatio: Record<number, number>;
}

export function treeMetrics(nodes: EvalNode[]): TreeMetrics {
  const cards = nodes.filter((n) => n.level > 0);
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const title = new Map(cards.map((n) => [n.id, bigrams(n.title)]));
  const text = new Map(cards.map((n) => [n.id, bigrams(n.title + n.body)]));
  const pair = (m: Map<string, Set<string>>) => {
    const sims: number[] = [];
    const dups: { a: string; b: string; sim: number }[] = [];
    for (let i = 0; i < cards.length; i++)
      for (let j = i + 1; j < cards.length; j++) {
        const s = jaccard(m.get(cards[i].id)!, m.get(cards[j].id)!);
        sims.push(s);
        if (s >= DUP_THRESHOLD)
          dups.push({
            a: cards[i].title,
            b: cards[j].title,
            sim: +s.toFixed(2),
          });
      }
    const mean = sims.length
      ? sims.reduce((x, y) => x + y, 0) / sims.length
      : 0;
    return {
      stats: {
        mean: +mean.toFixed(3),
        max: +(sims.length ? Math.max(...sims) : 0).toFixed(3),
        dupRate: +(sims.length ? dups.length / sims.length : 0).toFixed(4),
      },
      dups,
    };
  };
  const t = pair(title);
  const x = pair(text);
  const byLevel: Record<number, number> = {};
  const bodySum: Record<number, number> = {};
  for (const n of cards) {
    byLevel[n.level] = (byLevel[n.level] ?? 0) + 1;
    bodySum[n.level] = (bodySum[n.level] ?? 0) + [...n.body].length;
  }
  const avgBodyChars = Object.fromEntries(
    Object.entries(byLevel).map(([l, c]) => [l, Math.round(bodySum[+l] / c)]),
  );
  const ratios: Record<number, number[]> = {};
  for (const n of cards) {
    if (n.level < 2) continue;
    const known = new Set<string>();
    let p = n.parentId ? byId.get(n.parentId) : undefined;
    while (p) {
      for (const g of bigrams(p.title + p.body)) known.add(g);
      p = p.parentId ? byId.get(p.parentId) : undefined;
    }
    for (const s of cards)
      if (s.parentId === n.parentId && s.id !== n.id)
        for (const g of bigrams(s.title + s.body)) known.add(g);
    const own = text.get(n.id)!;
    if (!own.size) continue;
    let fresh = 0;
    for (const g of own) if (!known.has(g)) fresh++;
    (ratios[n.level] ??= []).push(fresh / own.size);
  }
  const newInfoRatio = Object.fromEntries(
    Object.entries(ratios).map(([l, r]) => [
      l,
      +(r.reduce((a, b) => a + b, 0) / r.length).toFixed(3),
    ]),
  );
  return {
    nodes: cards.length,
    byLevel,
    avgBodyChars,
    titlePairs: t.stats,
    textPairs: x.stats,
    nearDuplicates: x.dups.sort((a, b) => b.sim - a.sim).slice(0, 10),
    newInfoRatio,
  };
}
