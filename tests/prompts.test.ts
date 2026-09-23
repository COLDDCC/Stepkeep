import { describe, expect, it } from "vitest";
import { buildQaRequest, DecompositionSchema } from "../src/prompts";
import type { Step, Task } from "../src/types";

const task: Task = { id: "t", title: "部署网站", sourceText: "第一步……第二步……", currentStepId: "s1", createdAt: 0, updatedAt: 0 };
const steps: Step[] = [0, 1].map((index) => ({
  id: `s${index}`, taskId: "t", index, title: `标题${index + 1}`, body: `正文${index + 1}`, doneCriteria: `标准${index + 1}`, status: "todo",
}));

describe("buildQaRequest", () => {
  it("当前步骤的注意事项带进追问上下文", () => {
    const withCaution = { ...steps[0], cautions: ["用户名注册后不能改"] };
    const { messages } = buildQaRequest(task, steps, withCaution, [{ role: "user", content: "?", at: 0 }]);
    expect(messages[0].content).toContain("- 用户名注册后不能改");
  });

  it("原文放 system 并打缓存断点，当前步骤只拼在线程第一条提问前", () => {
    const { system, messages } = buildQaRequest(task, steps, steps[1], [
      { role: "user", content: "报错了", at: 0 },
      { role: "assistant", content: "试试这样", at: 1 },
      { role: "user", content: "还是不行", at: 2 },
    ]);
    expect(system[1].text).toContain(task.sourceText);
    expect(system[1].text).toContain("2. 标题2");
    expect(system[1].cache_control).toEqual({ type: "ephemeral" });
    expect(messages[0].content).toMatch(/序号="2\/2"[\s\S]*正文2[\s\S]*标准2[\s\S]*报错了$/);
    expect(messages[2].content).toBe("还是不行");
  });
});

describe("DecompositionSchema", () => {
  it("校验拆解结果结构", () => {
    const ok = { title: "T", steps: [{ title: "a", body: "b", cautions: [], done_criteria: "c" }] };
    expect(DecompositionSchema.safeParse(ok).success).toBe(true);
    expect(DecompositionSchema.safeParse({ title: "T", steps: [{ title: "a" }] }).success).toBe(false);
  });
});
