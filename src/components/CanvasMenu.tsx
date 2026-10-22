import { useState } from "react";
import { Archive, Download, ListRestart, MoreHorizontal, Pause, RotateCcw } from "lucide-react";
import { Menu } from "./Drawer";

/**
 * The canvas's top-right ⋯ menu: the one home for whole-canvas actions (重新摸底, 整理记录与恢复,
 * 导出, 归档). The root card's ⋯ offers the same 重新摸底 handler.
 */
export function CanvasMenu({
  paused,
  onReprobe,
  onActivity,
  onExport,
  onArchive,
}: {
  /** Paused organize runs on this canvas. */
  paused: number;
  onReprobe?: () => void;
  onActivity: () => void;
  onExport: () => void;
  onArchive: () => void;
}) {
  const [open, setOpen] = useState(false);
  const run = (fn: () => void) => () => {
    setOpen(false);
    fn();
  };
  return (
    <span className="canvas-more">
      <button
        className="chrome canvas-more-btn"
        aria-label="画布操作"
        title="画布操作"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <MoreHorizontal size={16} />
      </button>
      {open && (
        <Menu className="canvas-menu" onClose={() => setOpen(false)}>
          {onReprobe && (
            <button className="it" role="menuitem" onClick={run(onReprobe)}>
              <RotateCcw size={15} className="ico" />
              重新摸底
            </button>
          )}
          <button className="it" role="menuitem" onClick={run(onActivity)}>
            <ListRestart size={15} className="ico" />
            整理记录与恢复
            {paused > 0 && (
              <span className="canvas-menu-paused">
                <i aria-hidden="true" />
                {paused} 次暂停
              </span>
            )}
          </button>
          <button className="it" role="menuitem" onClick={run(onExport)}>
            <Download size={15} className="ico" />
            导出画布…
          </button>
          <hr />
          <button className="it quiet" role="menuitem" onClick={run(onArchive)}>
            <Archive size={15} className="ico" />
            归档画布
          </button>
        </Menu>
      )}
    </span>
  );
}

/** Shown left of the progress pill while an organize run is paused; opens 整理记录与恢复. */
export function PausedPill({ onOpen }: { onOpen: () => void }) {
  return (
    <button className="paused-pill" onClick={onOpen}>
      <Pause size={13} className="ico" />
      整理已暂停 · <b>继续</b>
    </button>
  );
}
