import ofl from "lxgw-wenkai-webfont/OFL.txt?raw";
import { useEffect, useRef, useState } from "react";
import {
  Info,
  Keyboard,
  KeyRound,
  LockKeyhole,
  Palette as PaletteIcon,
  Sparkles,
  X,
} from "lucide-react";
import type {
  AIConnectionResult,
  AISettings,
  AISettingsInput,
} from "../shared/types";
import { isDesktop } from "../api";
import {
  connectionStatusText,
  type ConnectionTestState,
} from "../model/connection";
import { SHORTCUTS, MOD } from "../model/shortcuts";
import pkg from "../../package.json";

/**
 * The API key row. A saved key is shown only masked; the plaintext never comes back from the
 * main process. "更换" reveals an input, "清除" removes the saved copy.
 */
export function ApiKeyField({
  settings,
  value,
  onChange,
  onClear,
  disabled,
}: {
  settings: AISettings;
  value: string;
  onChange: (value: string) => void;
  onClear: () => void;
  disabled?: boolean;
}) {
  const hasKey = settings.source === "saved" || settings.source === "session";
  const [replacing, setReplacing] = useState(!hasKey);
  // After saving or clearing, show the saved state again.
  useEffect(() => setReplacing(!hasKey), [hasKey, settings.keyHint]);
  const where =
    settings.source === "saved"
      ? "已加密保存在本机钥匙串"
      : settings.source === "session"
        ? "仅本次运行，退出后需重新输入"
        : settings.source === "environment"
          ? "使用环境变量 OPENAI_API_KEY"
          : "";
  return (
    <div className="key-field">
      <span className="key-label">API 密钥</span>
      {hasKey || settings.source === "environment" ? (
        <div className="key-saved" data-source={settings.source}>
          <KeyRound size={15} className="ico" />
          <span className="mask" aria-label="已保存的密钥（已遮盖）">
            {settings.keyHint ?? "••••"}
          </span>
          <span className="where">{where}</span>
          {hasKey && !disabled && (
            <span className="key-acts">
              {!replacing && (
                <button
                  type="button"
                  className="btn sm"
                  onClick={() => setReplacing(true)}
                >
                  更换
                </button>
              )}
              <button type="button" className="btn sm" onClick={onClear}>
                清除
              </button>
            </span>
          )}
        </div>
      ) : null}
      {(replacing || !hasKey) && (
        <input
          type="password"
          aria-label="API 密钥"
          autoComplete="off"
          spellCheck={false}
          value={value}
          placeholder={
            hasKey ? "输入新的 API key 替换当前密钥" : "输入你的 API key"
          }
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
        />
      )}
      {settings.keyStorage === "unavailable" && (
        <p className="key-warn" role="note">
          这台电脑的系统钥匙串不可用，无法加密保存密钥：密钥只保留到退出应用。
        </p>
      )}
    </div>
  );
}

type Section = "ai" | "appearance" | "shortcuts" | "about";
const SECTIONS: [Section, string, React.ReactNode][] = [
  ["ai", "AI 服务", <Sparkles size={16} className="ico" />],
  ["appearance", "外观", <PaletteIcon size={16} className="ico" />],
  ["shortcuts", "快捷键", <Keyboard size={16} className="ico" />],
  ["about", "关于与许可", <Info size={16} className="ico" />],
];

/** The settings page: a full view over the canvas, opened with ⌘. / Ctrl+. or from ⌘K. Esc closes. */
export function Settings({
  settings,
  dark,
  onTheme,
  onClose,
  onSave,
  onTest,
  initial = "ai",
}: {
  settings: AISettings;
  dark: boolean;
  onTheme: (dark: boolean) => void;
  onClose: () => void;
  onSave: (s: AISettingsInput) => Promise<void>;
  onTest: (s: AISettingsInput) => Promise<AIConnectionResult>;
  initial?: Section;
}) {
  const [section, setSection] = useState<Section>(initial);
  const [model, setModel] = useState(settings.model),
    [endpoint, setEndpoint] = useState(settings.baseUrl),
    [key, setKey] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [saved, setSaved] = useState(""),
    [test, setTest] = useState<ConnectionTestState>({ phase: "idle" });
  const body = useRef<HTMLDivElement>(null);
  const root = useRef<HTMLElement>(null);
  useEffect(() => {
    root.current?.focus();
  }, []);
  const draft = (): AISettingsInput => ({
    model,
    baseUrl: endpoint,
    ...(key ? { apiKey: key } : {}),
  });
  // Edits invalidate an earlier result so it never describes different settings.
  const edited =
    <T,>(set: (value: T) => void) =>
    (value: T) => {
      set(value);
      setSaved("");
      setTest({ phase: "idle" });
    };
  const runTest = async () => {
    setTest({ phase: "testing" });
    try {
      setTest({ phase: "done", result: await onTest(draft()) });
    } catch (error) {
      const message = String(error instanceof Error ? error.message : error);
      setTest({
        phase: "done",
        result: {
          ok: false,
          kind: "unknown",
          message: /Invalid|url|URL/.test(message)
            ? "设置格式不对：请检查 API 地址（远程地址需 https）和模型 ID。"
            : "测试没有完成，请检查设置后重试。",
        },
      });
    }
  };
  const save = async (input: AISettingsInput, done: string) => {
    setBusy(true);
    setError("");
    try {
      await onSave(input);
      setKey("");
      setSaved(done);
    } catch (error) {
      setError(String(error instanceof Error ? error.message : error));
    } finally {
      setBusy(false);
    }
  };
  const groups = [...new Set(SHORTCUTS.map((s) => s.group))];
  return (
    <section
      ref={root}
      tabIndex={-1}
      className="settings-page"
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-title"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onClose();
        }
      }}
    >
      <header className="settings-head">
        <h1 id="settings-title">设置</h1>
        <span className="lab">{MOD}. 打开 · Esc 关闭</span>
        <button
          className="ib"
          aria-label="关闭设置"
          data-tip="关闭设置 Esc"
          onClick={onClose}
        >
          <X size={18} />
        </button>
      </header>
      <div className="settings-main">
        <nav className="settings-nav" aria-label="设置分区">
          {SECTIONS.map(([id, label, icon]) => (
            <button
              key={id}
              className={section === id ? "on" : ""}
              aria-current={section === id ? "page" : undefined}
              onClick={() => {
                setSection(id);
                body.current?.scrollTo({ top: 0 });
              }}
            >
              {icon}
              {label}
            </button>
          ))}
        </nav>
        <div className="settings-body" ref={body}>
          {section === "ai" && (
            <div className="settings-section" aria-labelledby="sec-ai">
              <h2 id="sec-ai">AI 服务</h2>
              <p className="sec-lede">
                内置演练可以离线使用。探索其他主题、展开概念、批注问答和画布上的灰色提示，需要你自己的模型
                API。
              </p>
              {!isDesktop && (
                <div className="setup-notice">
                  这是浏览器预览：API
                  设置只在桌面客户端中可用，这里不会接收或保存密钥。
                </div>
              )}
              <form
                className="settings-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  void save(draft(), "已保存。发出提问时才会调用模型。");
                }}
              >
                <label>
                  <span className="key-label">API 地址</span>
                  <input
                    type="url"
                    required
                    value={endpoint}
                    onChange={(e) => edited(setEndpoint)(e.target.value)}
                    disabled={!isDesktop}
                  />
                </label>
                <label>
                  <span className="key-label">模型 ID</span>
                  <input
                    value={model}
                    required
                    placeholder="gpt-4o-mini"
                    onChange={(e) => edited(setModel)(e.target.value)}
                    disabled={!isDesktop}
                  />
                </label>
                <ApiKeyField
                  settings={settings}
                  value={key}
                  onChange={edited(setKey)}
                  disabled={!isDesktop}
                  onClear={() =>
                    void save(
                      { model, baseUrl: endpoint, apiKey: "" },
                      "已清除保存的密钥。",
                    )
                  }
                />
                <div className="privacy-note">
                  <LockKeyhole size={16} />
                  <span>
                    密钥只交给桌面主进程，用系统钥匙串（safeStorage）加密后保存在本机，界面只显示末四位。提问时，你的问题、当前批注的对话历史和列出的上下文会发送到上方
                    API 服务商，可能产生费用。
                  </span>
                </div>
                {error && <div className="inline-error">{error}</div>}
                <div className="settings-actions">
                  <button
                    type="button"
                    className="btn"
                    disabled={!isDesktop || busy || test.phase === "testing"}
                    onClick={() => void runTest()}
                  >
                    {test.phase === "testing" ? "测试中…" : "测试连接"}
                  </button>
                  <span
                    className="connection-status"
                    data-state={
                      test.phase === "done"
                        ? test.result.ok
                          ? "success"
                          : "failure"
                        : test.phase
                    }
                    role="status"
                    aria-live="polite"
                  >
                    {connectionStatusText(test) || saved}
                  </span>
                  <button
                    className="btn primary"
                    type="submit"
                    disabled={!isDesktop || busy}
                  >
                    {busy ? "保存中…" : "保存"}
                  </button>
                </div>
                <p className="settings-foot">
                  保存不会调用模型；「测试连接」会用上面填写的设置发一次极短的请求（可能产生极少费用），不会保存。
                </p>
              </form>
            </div>
          )}
          {section === "appearance" && (
            <div className="settings-section">
              <h2>外观</h2>
              <div className="setting-row">
                <span>
                  <b>主题</b>
                  <small>也可以在画布上按 D 切换</small>
                </span>
                <div className="seg" role="radiogroup" aria-label="主题">
                  {(
                    [
                      [false, "浅色"],
                      [true, "深色"],
                    ] as const
                  ).map(([value, label]) => (
                    <button
                      key={label}
                      role="radio"
                      aria-checked={dark === value}
                      className={dark === value ? "on" : ""}
                      onClick={() => onTheme(value)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="setting-row">
                <span>
                  <b>字体</b>
                  <small>霞鹜文楷 LXGW WenKai，随应用离线打包</small>
                </span>
              </div>
            </div>
          )}
          {section === "shortcuts" && (
            <div className="settings-section">
              <h2>快捷键</h2>
              {groups.map((g) => (
                <div key={g} className="shortcut-group">
                  <h3 className="lab">{g}</h3>
                  <dl>
                    {SHORTCUTS.filter((s) => s.group === g).map((s) => (
                      <div key={s.label} className="shortcut">
                        <dt>{s.label}</dt>
                        <dd>
                          <kbd className="kbd">{s.keys}</kbd>
                        </dd>
                      </div>
                    ))}
                  </dl>
                </div>
              ))}
            </div>
          )}
          {section === "about" && (
            <div className="settings-section">
              <h2>关于与许可</h2>
              <div className="setting-row">
                <span>
                  <b>Studyboard</b>
                  <small>版本 {pkg.version} · 白板保存在这台设备上</small>
                </span>
              </div>
              <p className="sec-lede">
                字体：霞鹜文楷 LXGW WenKai / LXGW WenKai
                Mono（随应用离线打包），以 SIL Open Font License 1.1
                授权。图标：Lucide（ISC 许可）。
              </p>
              <details className="licenses">
                <summary>SIL Open Font License 1.1 全文</summary>
                <pre>{ofl}</pre>
              </details>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
