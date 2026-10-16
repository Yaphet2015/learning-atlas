import ofl from "lxgw-wenkai-webfont/OFL.txt?raw";
import { useState } from "react";
import { Check, KeyRound, LockKeyhole, X } from "lucide-react";
import type { AISettings, AISettingsInput } from "../shared/types";
import { isDesktop } from "../api";
export function Settings({
  settings,
  onClose,
  onSave,
}: {
  settings: AISettings;
  onClose: () => void;
  onSave: (s: AISettingsInput) => Promise<void>;
}) {
  const [model, setModel] = useState(settings.model),
    [endpoint, setEndpoint] = useState(settings.baseUrl),
    [key, setKey] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        className="modal settings-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
      >
        <button
          className="modal-close icon-button"
          aria-label="关闭设置"
          onClick={onClose}
        >
          <X size={19} />
        </button>
        <div className="modal-icon">
          <KeyRound size={24} />
        </div>
        <span className="eyebrow">真实模型 · PI-DURABLE</span>
        <h2 id="settings-title">为你的问题连接 AI</h2>
        <p>
          内置演练可以离线使用。探索其他主题、展开概念和批注问答，需要你自己的模型
          API。
        </p>
        {!isDesktop && (
          <div className="setup-notice">
            这是浏览器预览。API 设置在 macOS
            桌面客户端中可用；这里不会接收密钥。
          </div>
        )}
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            try {
              await onSave({
                model,
                baseUrl: endpoint,
                ...(key ? { apiKey: key } : {}),
              });
              setKey("");
              onClose();
            } catch (error) {
              setError(String(error instanceof Error ? error.message : error));
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            API 地址
            <input
              type="url"
              required
              value={endpoint}
              onChange={(e) => setEndpoint(e.target.value)}
              disabled={!isDesktop}
            />
          </label>
          <label>
            模型 ID
            <input
              value={model}
              required
              placeholder="gpt-4o-mini"
              onChange={(e) => setModel(e.target.value)}
              disabled={!isDesktop}
            />
          </label>
          <label>
            API 密钥{" "}
            <span>
              {settings.configured
                ? "已配置 · 留空保持当前密钥"
                : "仅本次应用会话"}
            </span>
            <input
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={key}
              placeholder="输入你的 API key"
              onChange={(e) => setKey(e.target.value)}
              disabled={!isDesktop}
            />
          </label>
          <div className="privacy-note">
            <LockKeyhole size={16} />
            <span>
              密钥只交给桌面主进程，本版不保存到磁盘。提问时，你的问题、当前批注的对话历史和列出的上下文会发送到上方
              API 服务商，可能产生费用。其他白板不会一并发送。
            </span>
          </div>
          {error && <div className="inline-error">{error}</div>}
          <button
            className="primary-button"
            type="submit"
            disabled={!isDesktop || busy}
          >
            {busy
              ? "保存设置…"
              : settings.configured
                ? "更新连接设置"
                : "连接模型"}
          </button>
        </form>
        <p className="settings-foot">
          配置不代表已验证连通；只有你发出提问时才调用模型。
        </p>
        <details className="licenses">
          <summary>关于 · 开源许可</summary>
          <p>
            字体：霞鹜文楷 LXGW WenKai / LXGW WenKai Mono（随应用离线打包），以
            SIL Open Font License 1.1 授权。
          </p>
          <pre>{ofl}</pre>
        </details>
      </section>
    </div>
  );
}
