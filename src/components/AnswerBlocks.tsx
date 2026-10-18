import { useMemo, useState } from "react";
import { Check, Layers3, Plus } from "lucide-react";
import {
  parseAnswer,
  type Block,
  type Inline,
  type OutlineItem,
} from "../model/answer";

/** Without text-autospace, Latin/digit runs get a hair of margin (no inserted spaces, so copying stays exact). */
const AUTOSPACE =
  typeof CSS !== "undefined" && CSS.supports?.("text-autospace", "normal");
function Text({ v }: { v: string }) {
  if (AUTOSPACE) return <>{v}</>;
  return (
    <>
      {v.split(/([A-Za-z0-9][A-Za-z0-9.%+-]*)/).map((part, i) =>
        i % 2 ? (
          <span className="lat" key={i}>
            {part}
          </span>
        ) : (
          part
        ),
      )}
    </>
  );
}
export function Inlines({ inl }: { inl: Inline[] }) {
  return (
    <>
      {inl.map((i, k) =>
        i.t === "b" ? (
          <b key={k}>
            <Text v={i.v} />
          </b>
        ) : i.t === "em" ? (
          <em key={k}>
            <Text v={i.v} />
          </em>
        ) : i.t === "code" ? (
          <code key={k}>{i.v}</code>
        ) : (
          <Text key={k} v={i.v} />
        ),
      )}
    </>
  );
}

export interface AnswerActions {
  /** 「铺成第一层」 for this answer's outline; absent when it does not apply. */
  onLay?: (items: OutlineItem[]) => void;
  /** Already laid onto the canvas: offer to locate it instead. */
  laid?: boolean;
  onLocate?: () => void;
  /** The “+” on one outline row: add just this item as a card. */
  onAddItem?: (item: OutlineItem) => void;
  checked?: number[];
  onToggleStep?: (index: number) => void;
  /** 检查一下 → “我选了 X，理由 Y” as the learner's next message. */
  onAnswerCheck?: (text: string) => void;
}

function OutlineBlock({
  items,
  actions,
}: {
  items: OutlineItem[];
  actions: AnswerActions;
}) {
  return (
    <div className="blk ans-outline">
      <div className="bl">
        <span>骨架 · {items.length} 块</span>
        {actions.laid ? (
          <span className="lay done">
            已铺成第一层 ·{" "}
            <button className="link" onClick={actions.onLocate}>
              在画布上定位
            </button>
          </span>
        ) : actions.onLay ? (
          <button className="lay" onClick={() => actions.onLay?.(items)}>
            <Layers3 size={14} className="ico" />
            铺成第一层
          </button>
        ) : null}
      </div>
      <ol>
        {items.map((item, i) => (
          <li key={i}>
            <span className="n">{String(i + 1).padStart(2, "0")}</span>
            <span className="x">
              {item.head && (
                <b>
                  <Text v={item.head} />
                </b>
              )}
              <Inlines inl={item.rest} />
            </span>
            {actions.onAddItem && (
              <button
                className="add"
                aria-label={`把「${item.head}」加成一张卡`}
                data-tip="加成一张卡"
                onClick={() => actions.onAddItem?.(item)}
              >
                <Plus size={14} className="ico" />
              </button>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}

function CheckBlock({
  q,
  options,
  onAnswer,
}: {
  q: string;
  options?: string[];
  onAnswer?: (text: string) => void;
}) {
  const [pick, setPick] = useState<string | null>(null);
  const [why, setWhy] = useState("");
  const submit = () => {
    if (!onAnswer || (!pick && !why.trim())) return;
    onAnswer(
      pick
        ? `我选了「${pick}」${why.trim() ? `，理由是：${why.trim()}` : "。"}`
        : why.trim(),
    );
    setPick(null);
    setWhy("");
  };
  return (
    <div className="blk check">
      <div className="bl">
        <span>检查一下</span>
        <span className="aside">答完我再讲为什么</span>
      </div>
      <div className="q">
        <Text v={q} />
      </div>
      {options && (
        <div className="opts" role="radiogroup" aria-label={q}>
          {options.map((o) => (
            <button
              key={o}
              role="radio"
              aria-checked={pick === o}
              className={`opt ${pick === o ? "on" : ""}`}
              onClick={() => setPick(pick === o ? null : o)}
            >
              {o}
            </button>
          ))}
        </div>
      )}
      {onAnswer && (
        <div className="reply">
          <input
            aria-label="说一句理由"
            placeholder={options ? "说一句理由（可选）" : "用一句话回答"}
            value={why}
            onChange={(e) => setWhy(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter" && !e.nativeEvent.isComposing) submit();
            }}
          />
          <button
            className={`btn sm ${pick || why.trim() ? "primary" : ""}`}
            disabled={!pick && !why.trim()}
            onClick={submit}
          >
            提交
          </button>
        </div>
      )}
    </div>
  );
}

function BlockView({
  block,
  actions,
}: {
  block: Block;
  actions: AnswerActions;
}) {
  switch (block.kind) {
    case "para":
      return (
        <p>
          <Inlines inl={block.inl} />
        </p>
      );
    case "outline":
      return <OutlineBlock items={block.items} actions={actions} />;
    case "analogy":
      return (
        <div className="blk analogy">
          <div className="bl">
            <span>类比</span>
          </div>
          <p>
            <Inlines inl={block.inl} />
          </p>
        </div>
      );
    case "practice":
      return (
        <div className="blk practice">
          <div className="bl">
            <span>小练习 · 先猜再核对</span>
          </div>
          <div className="lead">
            <Inlines inl={block.lead} />
          </div>
          {block.steps.length > 0 && (
            <ul>
              {block.steps.map((s, i) => {
                const on = actions.checked?.includes(i) ?? false;
                return (
                  <li key={i}>
                    <button
                      role="checkbox"
                      aria-checked={on}
                      className={`box ${on ? "on" : ""}`}
                      onClick={() => actions.onToggleStep?.(i)}
                      disabled={!actions.onToggleStep}
                    >
                      {on && <Check size={12} strokeWidth={3} />}
                    </button>
                    <span>
                      <Text v={s} />
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      );
    case "check":
      return (
        <CheckBlock
          q={block.q}
          options={block.options}
          onAnswer={actions.onAnswerCheck}
        />
      );
  }
}

/** One tutor answer, rendered as blocks. Never renders the raw markdown. */
export function AnswerBlocks({
  text,
  streaming = false,
  actions = {},
}: {
  text: string;
  streaming?: boolean;
  actions?: AnswerActions;
}) {
  const blocks = useMemo(() => parseAnswer(text, streaming), [text, streaming]);
  return (
    <>
      {blocks.map((b, i) => (
        <BlockView key={i} block={b} actions={actions} />
      ))}
    </>
  );
}
