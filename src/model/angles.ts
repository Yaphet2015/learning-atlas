import type { DepthType, HintAngle } from "../shared/types";

/** Which way to dig under a card: chosen by the learner, it steers the expand prompt. */
export type DigAngle = HintAngle;
export const DIG_ANGLES: DigAngle[] = ["why", "how", "example", "edge", "compare", "apply"];

export const ANGLE_LABEL: Record<DigAngle, string> = {
  why: "为什么",
  how: "怎么做",
  example: "举个例子",
  edge: "边界与例外",
  compare: "对照",
  apply: "怎么用",
};
export const ANGLE_HINT: Record<DigAngle, string> = {
  why: "原因与机制",
  how: "步骤与做法",
  example: "具体例子、算例",
  edge: "不成立的情形、常见误区",
  compare: "和相近概念的区别",
  apply: "用在实际判断里",
};
/** The depth tag a card dug at this angle carries. */
export const ANGLE_DEPTH: Record<DigAngle, DepthType> = {
  why: "why",
  how: "how",
  example: "apply",
  edge: "edge",
  compare: "compare",
  apply: "apply",
};
const RULE: Record<DigAngle, string> = {
  why: "每张新卡片回答一个“为什么”：讲清原因、机制或背后的约束，summary 直接给出原因本身。",
  how: "每张新卡片讲一个“怎么做”或“如何运作”：给出具体步骤、顺序或操作要点，keyPoints 写成可执行的步骤或检查项。",
  example: "每张新卡片围绕一个具体例子：真实场景、数字算例或对比案例，example 字段必填，summary 写这个例子说明了什么。",
  edge: "每张新卡片讲一个边界条件、例外或常见误区：什么情况下它不成立、会出错或被误用，misconception 字段尽量填写。",
  compare: "每张新卡片做一个对照：把当前概念和一个相近、容易混淆或可替代的概念放在一起，keyPoints 写出关键差异维度。",
  apply: "每张新卡片讲一个应用：在实际决策、练习或问题中怎么用它，keyPoints 写成判断标准或使用步骤。",
};

/** The expand-prompt paragraph for a chosen angle. */
export function angleRule(angle: DigAngle): string {
  return `学习者选择了挖掘方向「${ANGLE_LABEL[angle]}」（${ANGLE_HINT[angle]}）。${RULE[angle]}所有新卡片的 depthType 写 "${ANGLE_DEPTH[angle]}"，不要偏离这个方向，也不要再泛泛地解释“是什么”。`;
}

export const isAngle = (v: unknown): v is DigAngle =>
  typeof v === "string" && (DIG_ANGLES as string[]).includes(v);
