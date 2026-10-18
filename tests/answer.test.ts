import { describe, expect, it } from "vitest";
import {
  outlineOf,
  parseAnswer,
  parseInline,
  plain,
} from "../src/model/answer";
import { INSURANCE_ANSWER } from "./e2e/fixtures";

describe("parseAnswer", () => {
  it("splits the 重疾险 answer into para / outline / analogy / practice / check", () => {
    const blocks = parseAnswer(INSURANCE_ANSWER);
    expect(blocks.map((b) => b.kind)).toEqual([
      "para",
      "outline",
      "analogy",
      "practice",
      "check",
    ]);
    const [intro, outline, analogy, practice, check] = blocks;
    expect(intro).toEqual({
      kind: "para",
      inl: [
        {
          t: "text",
          v: "好，先给你骨架。一份重疾险条款，表面几十页，其实只有",
        },
        { t: "b", v: "四块" },
        { t: "text", v: "：" },
      ],
    });
    if (outline.kind !== "outline") throw new Error();
    expect(outline.items.map((i) => i.head)).toEqual([
      "保什么",
      "什么时候不赔",
      "怎么赔",
      "钱和手续",
    ]);
    expect(plain(outline.items[0].rest)).toBe(
      "病种数量、重疾 / 中症 / 轻症的分层、每种病的定义。",
    );
    if (analogy.kind !== "analogy") throw new Error();
    expect(plain(analogy.inl)).toMatch(/^像看租房合同/);
    expect(practice).toEqual({
      kind: "practice",
      lead: [{ t: "text", v: "随手打开一个产品页，只找三个数字：" }],
      steps: ["等待期多少天", "轻症赔保额的百分之几", "重疾能赔几次"],
    });
    expect(check).toEqual({
      kind: "check",
      q: "这四块里，哪块最容易被销售话术盖住？",
      options: ["保什么", "什么时候不赔", "怎么赔", "钱和手续"],
    });
  });
  it("never leaves raw markdown markers in the rendered text", () => {
    const text = parseAnswer(INSURANCE_ANSWER)
      .flatMap((b) =>
        b.kind === "para" || b.kind === "analogy"
          ? [plain(b.inl)]
          : b.kind === "outline"
            ? b.items.map((i) => i.head + plain(i.rest))
            : b.kind === "practice"
              ? [plain(b.lead), ...b.steps]
              : [b.q, ...(b.options ?? [])],
      )
      .join("\n");
    expect(text).not.toContain("**");
    expect(text).not.toMatch(/^\d\./m);
  });
  it("accepts 1、 / - lists, colon heads and bold labels", () => {
    const blocks = parseAnswer(
      "**类比**：像修自行车。\n1、链条：传动\n2、刹车：减速\n- 车铃\n**检查一下**：先修哪个？",
    );
    expect(blocks.map((b) => b.kind)).toEqual(["analogy", "outline", "check"]);
    const outline = blocks[1];
    if (outline.kind !== "outline") throw new Error();
    expect(outline.items.map((i) => [i.head, plain(i.rest)])).toEqual([
      ["链条", "传动"],
      ["刹车", "减速"],
      ["车铃", ""],
    ]);
  });
  it("lets 小练习 and 检查 take the list that follows them", () => {
    const blocks = parseAnswer(
      "小练习：先猜再核对\n- 改宽度\n- 改颜色\n\n检查：哪一步会重排？\n1. 布局\n2. 绘制",
    );
    expect(blocks).toEqual([
      {
        kind: "practice",
        lead: [{ t: "text", v: "先猜再核对" }],
        steps: ["改宽度", "改颜色"],
      },
      { kind: "check", q: "哪一步会重排？", options: ["布局", "绘制"] },
    ]);
  });
  it("gives a check no options when there is nothing to choose from", () => {
    expect(parseAnswer("检查：用一句话说说等待期？")).toEqual([
      { kind: "check", q: "用一句话说说等待期？" },
    ]);
  });
  it("shows an unfinished last line as a paragraph while streaming", () => {
    const partial = "骨架：\n1. **保什么**：病种\n2. **什么时候";
    const blocks = parseAnswer(partial, true);
    expect(blocks.map((b) => b.kind)).toEqual(["para", "outline", "para"]);
    // The dangling ** is hidden until its pair arrives.
    expect(blocks[2]).toEqual({
      kind: "para",
      inl: [{ t: "text", v: "2. 什么时候" }],
    });
    expect(parseAnswer("好的，先看**四", true)).toEqual([
      { kind: "para", inl: [{ t: "text", v: "好的，先看四" }] },
    ]);
    // Once the line is complete it joins the outline.
    expect(parseAnswer(partial + "不赔**：等待期\n", true)[1]).toMatchObject({
      kind: "outline",
      items: [{ head: "保什么" }, { head: "什么时候不赔" }],
    });
  });
  it("keeps other symbols literal and leaves HTML as text", () => {
    expect(parseInline("a <b>x</b> *斜* `c` ~d~ **粗**")).toEqual([
      { t: "text", v: "a <b>x</b> " },
      { t: "em", v: "斜" },
      { t: "text", v: " " },
      { t: "code", v: "c" },
      { t: "text", v: " ~d~ " },
      { t: "b", v: "粗" },
    ]);
  });
  it("outlineOf returns the first outline's items", () => {
    expect(outlineOf(INSURANCE_ANSWER).map((i) => i.head)).toHaveLength(4);
    expect(outlineOf("没有列表")).toEqual([]);
  });
});
