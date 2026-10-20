import { LoaderCircle } from "lucide-react";
import type { CanvasRun } from "../shared/types";
const phases: Record<CanvasRun["phase"], string> = {
  structure: "读取结构",
  reading: "校对内容",
  locking: "准备修改预览",
  editing: "预览局部修改",
  relations: "检查跨枝关系",
  validating: "校验结果",
  complete: "完成",
};
export function CanvasRunProgress({ run }: { run: CanvasRun }) {
  return (
    <>
      <LoaderCircle size={18} className="spin" aria-hidden="true" />
      <span>
        {phases[run.phase]} · {run.reviewed}/{run.total}
      </span>
    </>
  );
}
