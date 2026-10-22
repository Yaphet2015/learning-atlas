import { ArrowDown, Clock, Shuffle } from "lucide-react";

/** Two wrong 测 answers: three ways on (05-stuck); 往下拆 is the recommended one. */
export function StuckExits({
  busy,
  onSplit,
  onAnalogy,
  onLater,
}: {
  busy?: "split" | "analogy";
  onSplit: () => void;
  onAnalogy: () => void;
  onLater: () => void;
}) {
  return (
    <div className="stuck" role="group" aria-label="卡住了">
      <p className="stuck-k">换个办法，三选一：</p>
      <button className="stuck-opt rec" disabled={!!busy} onClick={onSplit}>
        <ArrowDown size={15} className="ico" aria-hidden="true" />
        <span>{busy === "split" ? "正在拆…" : "往下拆成 2 个小问题"}</span>
        <em>推荐</em>
      </button>
      <button className="stuck-opt" disabled={!!busy} onClick={onAnalogy}>
        <Shuffle size={15} className="ico" aria-hidden="true" />
        <span>{busy === "analogy" ? "正在想类比…" : "换个类比再讲一次"}</span>
      </button>
      <button className="stuck-opt" disabled={!!busy} onClick={onLater}>
        <Clock size={15} className="ico" aria-hidden="true" />
        <span>先标记“探索中”，稍后再回来</span>
      </button>
      <p className="beat-foot">拆出的小问题会以虚线草稿出现在卡片正下方，学完自动回到这一站重新测。</p>
    </div>
  );
}
