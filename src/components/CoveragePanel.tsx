import { useState } from "react";
import { Check, ChevronDown, Plus } from "lucide-react";
import type { Board } from "../shared/types";
import { coveredBlocks } from "../model/plan";

/**
 * The confirmed plan as a quiet checklist: which blocks already have a card and which are
 * still missing. Clicking a missing block asks for one card that covers it.
 */
export function CoveragePanel({
  board,
  busy,
  onCover,
}: {
  board: Board;
  busy: boolean;
  onCover: (blockId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const plan = board.plan;
  if (!plan || plan.status !== "confirmed" || !plan.blocks.length) return null;
  const covered = coveredBlocks(board);
  const done = plan.blocks.filter((b) => covered.has(b.id)).length;
  const ordered = plan.blocks
    .filter((b) => b.parent === null)
    .flatMap((top) => [top, ...plan.blocks.filter((b) => b.parent === top.id)]);
  const rest = plan.blocks.filter((b) => !ordered.includes(b));
  return (
    <div className={`chrome coverage ${open ? "open" : ""}`}>
      <button
        className="cov-head"
        aria-expanded={open}
        aria-controls="coverage-list"
        onClick={() => setOpen((o) => !o)}
      >
        <span className="lab">计划覆盖</span>
        <span className="cov-count" aria-label={`${plan.blocks.length} 块里已覆盖 ${done} 块`}>
          <b>{done}</b> / {plan.blocks.length}
        </span>
        <ChevronDown size={13} className="ico chev" aria-hidden="true" />
      </button>
      {open && (
        <ul id="coverage-list" className="cov-list">
          {[...ordered, ...rest].map((b) => {
            const has = covered.has(b.id);
            return (
              <li
                key={b.id}
                className={`cov-item ${has ? "covered" : "missing"} ${b.parent ? "sub" : "top"}`}
                data-block={b.id}
              >
                {has ? (
                  <span className="cov-row">
                    <Check size={13} className="ico mark" aria-hidden="true" />
                    <span className="t">{b.title}</span>
                    <span className="sr-only">已覆盖</span>
                  </span>
                ) : (
                  <button
                    className="cov-row"
                    disabled={busy}
                    title={b.why || "生成一张卡片覆盖这一块"}
                    aria-label={`生成：${b.title}`}
                    onClick={() => onCover(b.id)}
                  >
                    <span className="ico mark hollow" aria-hidden="true" />
                    <span className="t">{b.title}</span>
                    <Plus size={13} className="ico add" aria-hidden="true" />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
