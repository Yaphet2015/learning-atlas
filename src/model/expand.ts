/** Expand-mode user prompt for one card (the system rules live in tutorInstructions("expand")). */
export function expandPrompt(title: string): string {
  return `围绕「${title}」补充 2–4 个有帮助的新概念或具体子问题。先检查白板结构和已有子概念，避免重复或换句话重述已有内容；已展开过仍可继续补充。按知识关系设置 parent：同层概念放到共同父节点下，组成、原理或细节才放到对应概念下。先解释它如何工作或用一个例子拆开，不要一次铺开整个领域；不要按提问先后逐层往下挂。如果这次没有值得补充的新内容，返回 {"nodes":[],"relations":[]}，不要勉强凑数。`;
}
