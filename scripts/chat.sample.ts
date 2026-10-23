// Real-LLM sample for the v2 chat turn: 15 Chinese messages, tokens per turn and proposal hits.
// Reads LLM_TEST_API_KEY / LLM_TEST_BASE_URL / LLM_TEST_MODEL from the environment; skipped without them.
import { it } from "vitest";
import { writeFileSync } from "node:fs";
import { boardSchema } from "../src/shared/validation";
import type { Board } from "../src/shared/types";
import { chatPrompt, parseChatReply } from "../src/model/chat";
import { CHAT_INSTRUCTIONS } from "../electron/prompts";

const key = process.env.LLM_TEST_API_KEY;
const base = process.env.LLM_TEST_BASE_URL;
const model = process.env.LLM_TEST_MODEL;

const n = (id: string, title: string, parentId: string | null, order: number, extra = {}) => ({ id, kind: "concept", title, body: "", parentId, order, status: "unseen", ...extra });
const board = boardSchema.parse({
  version: 2, id: "b", title: "重疾险", topic: "怎么挑一份合适的重疾险", kind: "ai",
  createdAt: "2026-10-23T00:00:00.000Z", updatedAt: "2026-10-23T00:00:00.000Z",
  nodes: [
    n("q", "怎么挑一份合适的重疾险", null, 0, { question: true }),
    n("s1", "保费豁免条款", "q", 0, { status: "explained", body: "投保人或被保人出险后，后续保费不用再交，合同继续有效。" }),
    n("s2", "保额怎么定才够", "q", 1, { body: "保额一般按 3–5 年收入估算，要覆盖治疗费和康复期的收入缺口，再考虑预算。" }),
    n("s3", "等待期与观察期", "q", 2),
    n("s4", "重疾、中症、轻症的赔付比例", "q", 3),
  ],
  relations: [], notes: [], route: ["s1", "s2", "s3", "s4"],
  scene: { width: 180, color: "#E9AE7E", prediction: "", explanation: "", changed: null },
}) as Board;

// expected: "edit" | "start" | "none"
const sample: [string, "edit" | "start" | "none"][] = [
  ["第 3 站太浅了，换成讲等待期里最容易踩的坑", "edit"],
  ["把第 4 站删了吧，我已经懂了", "edit"],
  ["能不能在保额前面加一站讲健康告知？", "edit"],
  ["先讲赔付比例，再讲等待期", "edit"],
  ["第二站重点讲怎么算收入缺口", "edit"],
  ["等待期是什么意思？", "none"],
  ["保费豁免和保额有关系吗？", "none"],
  ["重疾险和医疗险有什么区别？", "none"],
  ["多次赔付值得买吗？", "none"],
  ["我懂了，继续往下走吧", "start"],
  ["开始下一站", "start"],
  ["我准备好学保额了", "start"],
  ["嗯……感觉有点难", "none"],
  ["第三站换成讲观察期和等待期的区别，另外轻症一般赔多少？", "edit"],
  ["这条路线挺好的，谢谢", "none"],
];

it.skipIf(!key || !base || !model)("chat sample", async () => {
  const rows = [];
  // One running conversation, so later turns carry up to 6 earlier messages like the app does.
  const note = { id: "n", title: "", text: "", position: { x: 0, y: 0 }, attachedTo: { kind: "node" as const, id: "s2" }, messages: [] as Board["notes"][number]["messages"] };
  for (const [text, want] of sample) {
    const prompt = chatPrompt(board, note, text);
    const t0 = Date.now();
    const res = await fetch(`${base!.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model, temperature: 0.3, max_tokens: 600,
        messages: [
          { role: "system", content: CHAT_INSTRUCTIONS },
          { role: "system", content: `<atlas-selected-data>\n主题：${board.topic}\n</atlas-selected-data>` },
          { role: "user", content: prompt },
        ],
      }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = (await res.json()) as { choices: { message: { content: string } }[]; usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number } };
    const out = json.choices[0].message.content;
    const parsed = parseChatReply(out, board);
    const got = !parsed.proposal ? "none" : parsed.proposal.type === "editRoute" ? "edit" : "start";
    const at = new Date().toISOString();
    note.messages.push({ id: `u${rows.length}`, role: "user", text, createdAt: at }, { id: `a${rows.length}`, role: "assistant", text: parsed.reply, createdAt: at });
    rows.push({ text, want, got, hit: got === want, ms: Date.now() - t0, ...json.usage, reply: parsed.reply, proposal: parsed.proposal ?? null });
  }
  const totals = rows.map((r) => r.total_tokens);
  const summary = {
    model, turns: rows.length,
    hits: rows.filter((r) => r.hit).length,
    tokens: { min: Math.min(...totals), max: Math.max(...totals), mean: Math.round(totals.reduce((a, b) => a + b, 0) / totals.length) },
    prompt_mean: Math.round(rows.reduce((a, r) => a + r.prompt_tokens, 0) / rows.length),
    completion_mean: Math.round(rows.reduce((a, r) => a + r.completion_tokens, 0) / rows.length),
  };
  writeFileSync(process.env.SAMPLE_OUT ?? "/tmp/chat-sample.json", JSON.stringify({ summary, rows }, null, 2));
  console.log(JSON.stringify(summary));
});
