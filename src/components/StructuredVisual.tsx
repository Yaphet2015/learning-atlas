import { ArrowDown } from "lucide-react";
import type { VisualDiagram } from "../shared/types";

/** A data-only diagram (never HTML from the model). Rendered in the drawer, not on cards. */
export function StructuredVisual({ visual }: { visual: VisualDiagram }) {
  return (
    <figure className={`structured-visual visual-${visual.kind}`}>
      <figcaption>
        <span>
          {visual.title ??
            (visual.kind === "process"
              ? "过程一览"
              : visual.kind === "parts"
                ? "拆开看组成"
                : "放在一起比较")}
        </span>
        <small>{visual.basis === "analogy" ? "类比示意" : "结构示意"}</small>
      </figcaption>
      <div className="visual-labels">
        {visual.labels.map((label, index) => (
          <div className="visual-item" key={index}>
            {visual.kind === "process" && (
              <span className="visual-sequence">
                {String(index + 1).padStart(2, "0")}
              </span>
            )}
            <span>{label}</span>
            {visual.kind === "process" && index < visual.labels.length - 1 && (
              <ArrowDown size={11} />
            )}
          </div>
        ))}
      </div>
      {visual.caption && <p>{visual.caption}</p>}
    </figure>
  );
}
