import { useState } from "react";
import {
  Download,
  FileJson,
  FileText,
  Image,
  LoaderCircle,
  X,
} from "lucide-react";
import type { ExportFormat } from "../shared/transfer";

type BoardExportProps = {
  title: string;
  busy: boolean;
  onExport: (format: ExportFormat) => Promise<void>;
  onClose: () => void;
};

const formats = [
  {
    format: "data" as const,
    icon: FileJson,
    title: "学习数据",
    description:
      "包含知识地图、批注、学习进度和完整对话。可导入 Studyboard 继续学习。",
  },
  {
    format: "markdown" as const,
    icon: FileText,
    title: "Markdown 文档",
    description: "按知识层级整理内容，附批注、演练记录和完整对话。",
  },
  {
    format: "png" as const,
    icon: Image,
    title: "PNG 全图截图",
    description: "保存整张知识图，包括屏幕外的卡片。",
  },
];

export function BoardExport({
  title,
  busy,
  onExport,
  onClose,
}: BoardExportProps) {
  const [error, setError] = useState("");
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}
    >
      <section
        className="modal board-export"
        role="dialog"
        aria-modal="true"
        aria-labelledby="export-title"
        aria-busy={busy}
      >
        <button
          className="modal-close icon-button"
          aria-label="关闭导出"
          disabled={busy}
          onClick={onClose}
        >
          <X size={19} />
        </button>
        <span className="eyebrow">分享学习过程与结果</span>
        <h2 id="export-title">导出当前画板</h2>
        <p className="export-board-title">{title}</p>
        <div className="export-options">
          {formats.map(({ format, icon: Icon, title, description }, index) => (
            <button
              key={format}
              autoFocus={index === 0}
              disabled={busy}
              onClick={() => {
                setError("");
                void onExport(format).catch((e) =>
                  setError(
                    e instanceof Error ? e.message : "导出失败，请重试。",
                  ),
                );
              }}
            >
              <Icon size={23} />
              <span>
                <strong>{title}</strong>
                <small>{description}</small>
              </span>
              <Download size={17} />
            </button>
          ))}
        </div>
        {busy && (
          <p role="status">
            <LoaderCircle size={16} className="spin" /> 正在准备导出…
          </p>
        )}
        {error && (
          <p role="alert" className="export-error">
            {error}
          </p>
        )}
      </section>
    </div>
  );
}
