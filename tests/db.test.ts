import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { createTask, deleteTask, getSteps, getThread, getThreadsForTask, listTasks, putTask, putThread } from "../src/db";
import type { Step, Task } from "../src/types";

function task(id: string, updatedAt: number): Task {
  return { id, title: id, sourceText: "原文", currentStepId: null, createdAt: 0, updatedAt };
}
function step(taskId: string, index: number): Step {
  return { id: `${taskId}-${index}`, taskId, index, title: "", body: "", doneCriteria: "", status: "todo" };
}

describe("db", () => {
  it("按更新时间倒序列出任务，步骤按序号返回", async () => {
    await createTask(task("a", 1), [step("a", 1), step("a", 0)]);
    await createTask(task("b", 2), [step("b", 0)]);
    expect((await listTasks()).map((t) => t.id)).toEqual(["b", "a"]);
    await putTask(task("a", 3));
    expect((await listTasks()).map((t) => t.id)).toEqual(["a", "b"]);
    expect((await getSteps("a")).map((s) => s.index)).toEqual([0, 1]);
  });

  it("删除任务时连带删除步骤和追问线程", async () => {
    await putThread({ stepId: "a-0", taskId: "a", messages: [{ role: "user", content: "?", at: 0 }] });
    expect(await getThreadsForTask("a")).toHaveLength(1);
    await deleteTask("a");
    expect(await getSteps("a")).toEqual([]);
    expect(await getThread("a-0")).toBeUndefined();
    expect((await listTasks()).map((t) => t.id)).toEqual(["b"]);
    expect(await getSteps("b")).toHaveLength(1);
  });
});
