/** One list of shortcuts: the settings page shows it, tooltips read their keys from it. */
const mac =
  typeof navigator !== "undefined" &&
  /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
/** "⌘" on macOS, "Ctrl+" elsewhere. */
export const MOD = mac ? "⌘" : "Ctrl+";
export const isMacLike = mac;

export interface Shortcut {
  keys: string;
  label: string;
  group: "画布" | "卡片" | "AI 与批注" | "应用";
}

export const SHORTCUTS: Shortcut[] = [
  { group: "画布", keys: "V", label: "选择工具" },
  { group: "画布", keys: "H", label: "平移工具" },
  { group: "画布", keys: "空格 + 拖动", label: "临时平移" },
  { group: "画布", keys: "L", label: "连线" },
  { group: "画布", keys: "0", label: "查看全图" },
  {
    group: "画布",
    keys: `Shift / ${mac ? "⌘" : "Ctrl"} + 点击`,
    label: "多选卡片",
  },
  { group: "卡片", keys: "Tab", label: "加子概念" },
  { group: "卡片", keys: "Enter", label: "加并列概念" },
  { group: "卡片", keys: "F2", label: "改标题" },
  {
    group: "卡片",
    keys: "1 / 2 / 3",
    label: "掌握度：待探索 / 探索中 / 我能解释",
  },
  { group: "卡片", keys: "⌫", label: "删除选中" },
  { group: "卡片", keys: "F", label: "走一遍" },
  { group: "AI 与批注", keys: "/", label: "问一问（带上选中的卡片）" },
  { group: "AI 与批注", keys: "N", label: "批注" },
  { group: "AI 与批注", keys: `${MOD}Enter`, label: "发送提问" },
  { group: "应用", keys: `${MOD}K`, label: "切换地图" },
  { group: "应用", keys: `${MOD}\\`, label: "展开 / 收起左侧边栏" },
  { group: "应用", keys: `${MOD}N`, label: "新白板" },
  { group: "应用", keys: `${MOD}Z`, label: "撤销" },
  { group: "应用", keys: `${MOD}S`, label: "立即保存" },
  { group: "应用", keys: `${MOD}.`, label: "设置" },
  { group: "应用", keys: "D", label: "切换深浅色" },
  { group: "应用", keys: "Esc", label: "关闭面板 / 取消选择" },
];
