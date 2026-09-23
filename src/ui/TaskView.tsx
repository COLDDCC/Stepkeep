import { useEffect, useState } from "preact/hooks";
import { getSteps, getTask, getThreadsForTask, putStep, putTask } from "../db";
import { currentStep, nextStepAfterDone, progressOf } from "../progress";
import type { Settings } from "../settings";
import type { Step, StepStatus, Task } from "../types";
import type { Route } from "./App";
import { Markdown } from "./Markdown";
import { StepChat } from "./StepChat";

const STATUS_LABEL: Record<StepStatus, string> = { todo: "未开始", stuck: "卡住", done: "完成" };

export function TaskView({ taskId, settings, go }: { taskId: string; settings: Settings; go: (r: Route) => void }) {
  const [task, setTask] = useState<Task | null>(null);
  const [steps, setSteps] = useState<Step[]>([]);
  const [threadSizes, setThreadSizes] = useState<Record<string, number>>({});
  const [showSource, setShowSource] = useState(false);

  useEffect(() => {
    (async () => {
      const [t, s, threads] = await Promise.all([getTask(taskId), getSteps(taskId), getThreadsForTask(taskId)]);
      if (!t) return go({ name: "list" });
      setTask(t);
      setSteps(s);
      setThreadSizes(Object.fromEntries(threads.map((th) => [th.stepId, th.messages.length])));
    })();
  }, [taskId]);

  if (!task) return null;

  const step = currentStep(task, steps);
  const progress = progressOf(task, steps);

  const saveTask = async (patch: Partial<Task>) => {
    const next = { ...task, ...patch, updatedAt: Date.now() };
    setTask(next);
    await putTask(next);
  };

  const select = (s: Step) => {
    setShowSource(false);
    saveTask({ currentStepId: s.id });
  };

  const setStatus = async (s: Step, status: StepStatus) => {
    const updated = { ...s, status };
    const nextSteps = steps.map((x) => (x.id === s.id ? updated : x));
    setSteps(nextSteps);
    await putStep(updated);
    const target = status === "done" && s.status !== "done" ? nextStepAfterDone(nextSteps, s.index) : undefined;
    await saveTask({ currentStepId: (target ?? updated).id });
  };

  const markStuckIfTodo = async (s: Step) => {
    if (s.status === "todo") await setStatus(s, "stuck");
  };

  return (
    <div class="page task-page">
      <header class="bar">
        <button class="btn ghost" onClick={() => go({ name: "list" })}>
          ← 任务
        </button>
        <h2 class="bar-title" title={task.title}>
          {task.title}
        </h2>
        <span class={`badge ${progress.state}`}>{progress.label}</span>
      </header>

      <nav class="step-nav">
        {steps.map((s) => (
          <button
            key={s.id}
            class={`step-pill ${s.status} ${s.id === step?.id ? "current" : ""}`}
            title={`${s.index + 1}. ${s.title}（${STATUS_LABEL[s.status]}）${threadSizes[s.id] ? " · 有追问" : ""}`}
            onClick={() => select(s)}
          >
            {s.status === "done" ? "✓" : s.index + 1}
            {!!threadSizes[s.id] && <i class="dot" />}
          </button>
        ))}
      </nav>

      {step && (
        <section class={`card ${step.status}`}>
          <div class="card-head">
            <span class="muted">
              步骤 {step.index + 1}/{steps.length}
            </span>
            <div class="segmented">
              {(["todo", "stuck", "done"] as const).map((st) => (
                <button key={st} class={`seg ${st} ${step.status === st ? "on" : ""}`} onClick={() => setStatus(step, st)}>
                  {STATUS_LABEL[st]}
                </button>
              ))}
            </div>
          </div>
          <h3 class="card-title">{step.title}</h3>
          <Markdown source={step.body} />
          {!!step.cautions?.length && (
            <div class="cautions">
              <strong>注意</strong>
              <ul>
                {step.cautions.map((c, i) => (
                  <li key={i}>
                    <Markdown source={c} />
                  </li>
                ))}
              </ul>
            </div>
          )}
          {step.doneCriteria && (
            <div class="criteria">
              <strong>完成标准</strong>
              <Markdown source={step.doneCriteria} />
            </div>
          )}
          <div class="card-foot">
            <button class="btn" disabled={step.index === 0} onClick={() => select(steps[step.index - 1])}>
              上一步
            </button>
            <button class="btn ghost" onClick={() => setShowSource(!showSource)}>
              {showSource ? "收起原文" : "对照原文"}
            </button>
            {step.status === "done" ? (
              <button
                class="btn"
                disabled={step.index === steps.length - 1}
                onClick={() => select(steps[step.index + 1])}
              >
                下一步
              </button>
            ) : (
              <button class="btn primary" onClick={() => setStatus(step, "done")}>
                完成，下一步
              </button>
            )}
          </div>
        </section>
      )}

      {showSource && (
        <section class="source">
          {task.sourceUrl && (
            <a href={task.sourceUrl} target="_blank" rel="noreferrer">
              {task.sourceUrl}
            </a>
          )}
          <pre class="source-text">{task.sourceText}</pre>
        </section>
      )}

      {step && (
        <StepChat
          key={step.id}
          settings={settings}
          task={task}
          steps={steps}
          step={step}
          onAsk={() => markStuckIfTodo(step)}
          onSizeChange={(n) => setThreadSizes((m) => ({ ...m, [step.id]: n }))}
        />
      )}
    </div>
  );
}
