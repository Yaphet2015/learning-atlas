import type { ConceptNode } from "../shared/types";
import { DEPTH_LABEL } from "../model/expand";

/** The rest of a rich card, below its body in the drawer: key points, why, example, misconception, sources. */
export function CardDetail({ card }: { card: ConceptNode }) {
  const has =
    card.keyPoints?.length ||
    card.whyItMatters ||
    card.example ||
    card.misconception ||
    card.sources?.length;
  if (!has) return null;
  return (
    <div className="card-detail">
      {card.keyPoints && card.keyPoints.length > 0 && (
        <section className="cd-sec" aria-label="要点">
          <span className="cd-k">要点</span>
          <ul className="cd-points">
            {card.keyPoints.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
        </section>
      )}
      {card.whyItMatters && (
        <section className="cd-sec" aria-label="为什么重要">
          <span className="cd-k">为什么重要</span>
          <p>{card.whyItMatters}</p>
        </section>
      )}
      {card.example && (
        <section className="cd-sec cd-example" aria-label="例子">
          <span className="cd-k">例子</span>
          <p>{card.example}</p>
        </section>
      )}
      {card.misconception && (
        <section className="cd-sec cd-mis" aria-label="常见误解">
          <span className="cd-k">常见误解</span>
          <p>{card.misconception}</p>
        </section>
      )}
      {card.sources && card.sources.length > 0 && (
        <section className="cd-sec" aria-label="来源">
          <span className="cd-k">来源</span>
          <ul className="cd-sources">
            {card.sources.map((s, i) => (
              <li key={i}>
                {s.title}
                {s.url && (
                  // The app opens no external pages; the address is shown to copy.
                  <span className="cd-url" title={s.url}>
                    {" · "}
                    {host(s.url)}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

export function DepthTag({ card }: { card: ConceptNode }) {
  if (!card.depthType) return null;
  return <span className="depth-tag">{DEPTH_LABEL[card.depthType]}</span>;
}

const host = (url: string) => {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
};
