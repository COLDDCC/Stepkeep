import type { Step, Task } from "./types";

export interface Progress {
  done: number;
  total: number;
  /** 当前停留步骤的序号（从 1 开始），没有步骤时为 0 */
  position: number;
  /** 例如「卡在 4/7」「进行到 2/7」「已完成 7/7」 */
  label: string;
  state: "stuck" | "active" | "finished";
}

export function currentStep(task: Task, steps: Step[]): Step | undefined {
  return steps.find((s) => s.id === task.currentStepId) ?? steps.find((s) => s.status !== "done") ?? steps[0];
}

export function progressOf(task: Task, steps: Step[]): Progress {
  const total = steps.length;
  const done = steps.filter((s) => s.status === "done").length;
  const cur = currentStep(task, steps);
  const position = cur ? cur.index + 1 : 0;
  if (total > 0 && done === total) {
    return { done, total, position, label: `已完成 ${total}/${total}`, state: "finished" };
  }
  if (cur?.status === "stuck") {
    return { done, total, position, label: `卡在 ${position}/${total}`, state: "stuck" };
  }
  return { done, total, position, label: `进行到 ${position}/${total}`, state: "active" };
}

/** 标记完成后该落到哪一步：之后第一个未完成的，没有就往前找，全完成则留在原地 */
export function nextStepAfterDone(steps: Step[], doneIndex: number): Step | undefined {
  const pending = (s: Step) => s.status !== "done" && s.index !== doneIndex;
  return steps.find((s) => s.index > doneIndex && pending(s)) ?? steps.find(pending);
}
