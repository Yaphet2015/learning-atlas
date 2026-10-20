import { LoaderCircle, X } from "lucide-react";
import type { Board, CanvasRun } from "../shared/types";

const labels: Record<CanvasRun["status"], string> = {
  running: "进行中",
  paused: "已暂停",
  ready: "正在提交",
  applied: "已完成",
  cancelled: "已取消",
  failed: "未完成",
  conflict: "版本冲突",
};
export function CanvasActivity({
  board,
  runs,
  onClose,
  onResume,
  onCancel,
  onRestore,
}: {
  board: Board;
  runs: CanvasRun[];
  onClose: () => void;
  onResume: (run: CanvasRun) => void;
  onCancel: (run: CanvasRun) => void;
  onRestore: (id: string) => void;
}) {
  return (
    <div
      className="palette-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="chrome canvas-activity"
        role="dialog"
        aria-modal="true"
        aria-label="画布记录"
      >
        <header>
          <h2>画布记录</h2>
          <button
            className="btn sm"
            aria-label="关闭画布记录"
            onClick={onClose}
          >
            <X size={16} />
          </button>
        </header>
        {!runs.length && <p>还没有画布 Agent 记录。</p>}
        <ul>
          {runs.map((run) => (
            <li key={run.id}>
              <div>
                <strong>
                  {run.origin === "organize" ? "整理画布" : "对话编辑"}
                </strong>
                <span>{labels[run.status]}</span>
              </div>
              <p>
                {run.summary ||
                  run.error ||
                  `已确认 ${run.reviewed}/${run.total} 张卡片的当前版本`}
              </p>
              {run.status === "running" && (
                <LoaderCircle size={16} className="spin" />
              )}
              {run.status === "paused" && (
                <button
                  className="btn sm primary"
                  onClick={() => onResume(run)}
                >
                  继续
                </button>
              )}
              {["running", "paused", "ready"].includes(run.status) && (
                <button className="btn sm" onClick={() => onCancel(run)}>
                  放弃
                </button>
              )}
            </li>
          ))}
        </ul>
        {!!board.cardArchives?.length && (
          <>
            <h3>可恢复的源卡片</h3>
            <ul>
              {board.cardArchives.map((archive) => (
                <li key={archive.id}>
                  <div>
                    <strong>{archive.node.title}</strong>
                    <span>{archive.mergedInto ? "已合并" : "已移除"}</span>
                  </div>
                  <p>{archive.reason}</p>
                  <details>
                    <summary>查看原内容与学习记录</summary>
                    <p>{archive.node.body}</p>
                    {archive.node.hand && <p>批注：{archive.node.hand}</p>}
                    <p>
                      原状态：
                      {
                        {
                          unseen: "还未探索",
                          exploring: "正在探索",
                          explained: "我能解释",
                        }[archive.node.status]
                      }
                    </p>
                  </details>
                  <button
                    className="btn sm"
                    onClick={() => onRestore(archive.id)}
                  >
                    恢复原卡片
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}
