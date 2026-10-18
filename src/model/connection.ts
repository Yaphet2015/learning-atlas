import type { AIConnectionResult } from "../shared/types";

export type ConnectionTestState =
  | { phase: "idle" }
  | { phase: "testing" }
  | { phase: "done"; result: AIConnectionResult };

/** Human-readable line for the 「测试连接」 status row. */
export function connectionStatusText(state: ConnectionTestState): string {
  if (state.phase === "idle") return "";
  if (state.phase === "testing") return "正在测试连接…（最多 15 秒）";
  const { result } = state;
  if (result.ok)
    return `连接成功 · 已连到 ${result.model} · 用时 ${(result.latencyMs / 1000).toFixed(1)} 秒`;
  return result.message;
}
