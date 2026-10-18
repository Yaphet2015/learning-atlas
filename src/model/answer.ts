/**
 * Tutor answers are parsed into a few known blocks and rendered as React
 * nodes. Markdown is never rendered as HTML: inline only **b**, *em* and
 * `code` are recognised, everything else stays literal text.
 */
export type Inline = { t: "text" | "b" | "em" | "code"; v: string };
export type OutlineItem = { head: string; rest: Inline[] };
export type Block =
  | { kind: "para"; inl: Inline[] }
  | { kind: "outline"; items: OutlineItem[] }
  | { kind: "analogy"; inl: Inline[] }
  | { kind: "practice"; lead: Inline[]; steps: string[] }
  | { kind: "check"; q: string; options?: string[] };

const INLINE = /\*\*([^*\n]+?)\*\*|`([^`\n]+?)`|\*([^*\s\n][^*\n]*?)\*/g;

export function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  let last = 0;
  const push = (t: Inline["t"], v: string) => {
    if (!v) return;
    const prev = out.at(-1);
    if (t === "text" && prev?.t === "text") prev.v += v;
    else out.push({ t, v });
  };
  for (const m of text.matchAll(INLINE)) {
    push("text", text.slice(last, m.index));
    if (m[1] !== undefined) push("b", m[1]);
    else if (m[2] !== undefined) push("code", m[2]);
    else push("em", m[3]);
    last = m.index + m[0].length;
  }
  push("text", text.slice(last));
  return out;
}

export const plain = (inl: Inline[]) => inl.map((i) => i.v).join("");

const LIST = /^\s*(?:\d{1,2}\s*[.、．)）]\s*|[-*•·]\s+)(.+)$/;
/** A block label such as “类比：” or “**小练习**：”, with optional bold. */
const label = (names: string) =>
  new RegExp(
    `^\\s*(?:\\*\\*)?(?:${names})(?:\\*\\*)?\\s*[:：]\\s*(?:\\*\\*)?\\s*`,
  );
const ANALOGY = label("类比|打个比方");
const PRACTICE = label("小练习|练习|试一试|动手试试");
const CHECK = label("一句话检查|检查一下|检查|自测");
const HEADING = /^\s*#{1,6}\s+/;
const tidyStep = (s: string) =>
  s.replace(/^[\s，,]+|[\s。.!！?？]+$/g, "").trim();

function outlineItem(text: string): OutlineItem {
  const bold = /^\s*\*\*([^*\n]+?)\*\*\s*[:：，,—-]*\s*/.exec(text);
  if (bold)
    return {
      head: bold[1].trim(),
      rest: parseInline(text.slice(bold[0].length)),
    };
  const colon = /^([^:：]{1,24})[:：]\s*/.exec(text);
  if (colon)
    return {
      head: plain(parseInline(colon[1])).trim(),
      rest: parseInline(text.slice(colon[0].length)),
    };
  return { head: plain(parseInline(text)).trim(), rest: [] };
}

/** Split “随手打开…——等待期多少天、轻症…、重疾…” into a lead and steps. */
function practice(rest: string): { lead: Inline[]; steps: string[] } {
  const dash = rest.indexOf("——");
  const colon = rest.search(/[:：]/);
  const cut = dash >= 0 ? dash : colon;
  if (cut < 0) return { lead: parseInline(rest), steps: [] };
  const lead = rest.slice(0, cut).replace(/[\s，,]+$/, "") + "：";
  const steps = plain(parseInline(rest.slice(cut).replace(/^(——|[:：])/, "")))
    .split(/[、；;]|——/)
    .map(tidyStep)
    .filter(Boolean);
  return steps.length > 1
    ? { lead: parseInline(lead), steps }
    : { lead: parseInline(rest), steps: [] };
}

/** While streaming, an unmatched ** (its pair has not arrived yet) is hidden. */
function closeDangling(text: string) {
  const marks = text.split("**").length - 1;
  if (marks % 2 === 0) return text.replace(/\*$/, "");
  const at = text.lastIndexOf("**");
  return text.slice(0, at) + text.slice(at + 2);
}

/**
 * Parse an answer into blocks. While streaming, the last line may be
 * incomplete: it is shown as a plain paragraph until its newline arrives.
 */
export function parseAnswer(md: string, streaming = false): Block[] {
  const lines = md.replace(/\r\n?/g, "\n").split("\n");
  const tail = streaming && !md.endsWith("\n") ? lines.pop() : undefined;
  const blocks: Block[] = [];
  // 小练习 / 检查 without inline steps or options take the list that follows.
  let takesList: Block | null = null;
  for (const raw of lines) {
    const line = raw.replace(HEADING, "");
    if (!line.trim()) continue;
    const list = LIST.exec(line);
    if (list) {
      const text = list[1].trim();
      const prev = blocks.at(-1);
      if (takesList?.kind === "practice")
        takesList.steps.push(tidyStep(plain(parseInline(text))));
      else if (takesList?.kind === "check")
        takesList.options = [
          ...(takesList.options ?? []),
          tidyStep(plain(parseInline(text))),
        ];
      else if (prev?.kind === "outline") prev.items.push(outlineItem(text));
      else blocks.push({ kind: "outline", items: [outlineItem(text)] });
      continue;
    }
    takesList = null;
    let m: RegExpExecArray | null;
    let block: Block;
    if ((m = ANALOGY.exec(line)))
      block = { kind: "analogy", inl: parseInline(line.slice(m[0].length)) };
    else if ((m = PRACTICE.exec(line))) {
      block = { kind: "practice", ...practice(line.slice(m[0].length)) };
      if (!block.steps.length) takesList = block;
    } else if ((m = CHECK.exec(line))) {
      block = {
        kind: "check",
        q: plain(parseInline(line.slice(m[0].length))).trim(),
      };
      takesList = block;
    } else block = { kind: "para", inl: parseInline(line.trim()) };
    blocks.push(block);
  }
  // Check options default to the outline heads of the same answer.
  const heads = blocks
    .find((b) => b.kind === "outline")
    ?.items.map((i) => i.head);
  for (const b of blocks)
    if (b.kind === "check" && !b.options?.length) {
      if (heads && heads.length > 1) b.options = heads;
      else delete b.options;
    }
  if (tail?.trim())
    blocks.push({
      kind: "para",
      inl: parseInline(closeDangling(tail.trim())),
    });
  return blocks;
}

/** The first outline of an answer: what 「铺成第一层」 lays onto the canvas. */
export const outlineOf = (md: string) =>
  parseAnswer(md).find(
    (b): b is Extract<Block, { kind: "outline" }> => b.kind === "outline",
  )?.items ?? [];
