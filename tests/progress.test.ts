import { describe, expect, it } from "vitest";
import { currentStep, nextStepAfterDone, progressOf } from "../src/progress";
import type { Step, StepStatus, Task } from "../src/types";

function make(statuses: StepStatus[], current = 0): { task: Task; steps: Step[] } {
  const steps = statuses.map((status, index) => ({
    id: `s${index}`, taskId: "t", index, title: `步骤${index + 1}`, body: "", doneCriteria: "", status,
  }));
  const task: Task = { id: "t", title: "T", sourceText: "", currentStepId: `s${current}`, createdAt: 0, updatedAt: 0 };
  return { task, steps };
}

describe("progressOf", () => {
  it("当前步骤卡住时显示「卡在 n/总数」", () => {
    const { task, steps } = make(["done", "done", "done", "stuck", "todo", "todo", "todo"], 3);
    expect(progressOf(task, steps)).toMatchObject({ label: "卡在 4/7", state: "stuck", done: 3 });
  });

  it("进行中显示当前停留的步骤", () => {
    const { task, steps } = make(["done", "todo", "todo"], 1);
    expect(progressOf(task, steps)).toMatchObject({ label: "进行到 2/3", state: "active" });
  });

  it("全部完成", () => {
    const { task, steps } = make(["done", "done"], 1);
    expect(progressOf(task, steps)).toMatchObject({ label: "已完成 2/2", state: "finished" });
  });
});

describe("currentStep", () => {
  it("currentStepId 失效时落到第一个未完成的步骤", () => {
    const { task, steps } = make(["done", "todo", "todo"]);
    expect(currentStep({ ...task, currentStepId: "gone" }, steps)?.id).toBe("s1");
  });
});

describe("nextStepAfterDone", () => {
  it("跳到后面第一个未完成的步骤", () => {
    const { steps } = make(["todo", "done", "todo"]);
    expect(nextStepAfterDone(steps, 0)?.id).toBe("s2");
  });

  it("后面都完成了就回头找前面没做的", () => {
    const { steps } = make(["todo", "done", "done"]);
    expect(nextStepAfterDone(steps, 2)?.id).toBe("s0");
  });

  it("全部完成时没有下一步", () => {
    const { steps } = make(["done", "done"]);
    expect(nextStepAfterDone(steps, 1)).toBeUndefined();
  });
});
