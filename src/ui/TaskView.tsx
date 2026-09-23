import { useEffect, useState } from "preact/hooks";
import { getSteps, getTask, getThreadsForTask, putStep, putTask } from "../db";
import { currentStep, nextStepAfterDone } from "../progress";
import type { Settings } from "../settings";
import type { Step, StepStatus, Task } from "../types";
import type { Route } from "./App";
import { Markdown } from "./Markdown";
import { StepChat } from "./StepChat";

export function TaskView({ taskId, settings, go }: { taskId: string; settings: Settings; go: (r: Route) => void }) {
  const [task, setTask] = useState<Task | null>(null);
  const [steps, setSteps] = useState<Step[]>([]);
  const [threadSizes, setThreadSizes] = useState<Record<string, number>>({});
  const [showAll, setShowAll] = useState(false);
  const [showSource, setShowSource] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);

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
  const allDone = steps.length > 0 && steps.every((s) => s.status === "done");

  const saveTask = async (patch: Partial<Task>) => {
    const next = { ...task, ...patch, updatedAt: Date.now() };
    setTask(next);
    await putTask(next);
  };

  const select = (s: Step) => {
    setShowAll(false);
    setShowSource(false);
    setChatOpen(false);
    saveTask({ currentStepId: s.id });
  };

  const setStatus = async (s: Step, status: StepStatus) => {
    const updated = { ...s, status };
    const nextSteps = steps.map((x) => (x.id === s.id ? updated : x));
    setSteps(nextSteps);
    await putStep(updated);
    return nextSteps;
  };

  /** 「下一步」：把当前步记为完成，落到下一个没做完的步骤 */
  const next = async (s: Step) => {
    const nextSteps = await setStatus(s, "done");
    const target = nextStepAfterDone(nextSteps, s.index);
    if (target) select(target);
    else saveTask({ currentStepId: s.id });
  };

  const openChat = async (s: Step) => {
    setChatOpen(true);
    if (s.status === "todo") await setStatus(s, "stuck");
  };

  const chatVisible = step && (chatOpen || !!threadSizes[step.id]);

  return (
    <div class="page">
      <header class="topbar">
        <button class="btn-text" onClick={() => go({ name: "list" })}>
          ← 任务
        </button>
        <span class="topbar-title" title={task.title}>
          {task.title}
        </span>
      </header>

      {showAll ? (
        <section class="step-card">
          <h2 class="step-title">全部步骤</h2>
          <ol class="all-steps">
            {steps.map((s) => (
              <li key={s.id}>
                <button class={`all-step ${s.id === step?.id ? "current" : ""}`} onClick={() => select(s)}>
                  <span class={`dot ${s.status}`}>{s.index + 1}</span>
                  <span class="all-step-title">{s.title}</span>
                  <span class="all-step-state">{s.status === "done" ? "已完成" : s.status === "stuck" ? "卡住" : ""}</span>
                </button>
              </li>
            ))}
          </ol>
          <div class="step-actions">
            <button class="btn-outline" onClick={() => setShowAll(false)}>
              返回当前步骤
            </button>
          </div>
        </section>
      ) : (
        step && (
          <section class="step-card">
            <h2 class="step-title">{step.title}</h2>
            <Markdown class="step-body" source={step.body} />

            {!!step.cautions?.length && (
              <div class="step-note">
                <span class="note-label">注意</span>
                {step.cautions.map((c, i) => (
                  <Markdown key={i} source={c} />
                ))}
              </div>
            )}
            {step.doneCriteria && (
              <div class="step-note">
                <span class="note-label">做完的标志</span>
                <Markdown source={step.doneCriteria} />
              </div>
            )}

            <div class="dots">
              {steps.map((s) => (
                <button
                  key={s.id}
                  class={`dot ${s.status} ${s.id === step.id ? "current" : ""}`}
                  title={s.title}
                  onClick={() => select(s)}
                >
                  {s.status === "done" && s.id !== step.id ? "✓" : s.index + 1}
                </button>
              ))}
            </div>

            <div class="step-actions">
              <button class="btn-outline" onClick={() => setShowAll(true)}>
                全部步骤
              </button>
              {allDone ? (
                <button class="btn-solid" onClick={() => go({ name: "list" })}>
                  全部完成
                </button>
              ) : (
                <button class="btn-solid" onClick={() => next(step)}>
                  {step.index === steps.length - 1 ? "完成" : "下一步"}
                </button>
              )}
            </div>
          </section>
        )
      )}

      {step && !showAll && (
        <div class="step-links">
          {!chatVisible && (
            <button class="btn-text" onClick={() => openChat(step)}>
              卡住了？问一下
            </button>
          )}
          <button class="btn-text" onClick={() => setShowSource(!showSource)}>
            {showSource ? "收起原文" : "对照原文"}
          </button>
          {step.status === "done" && (
            <button class="btn-text" onClick={() => setStatus(step, "todo")}>
              标为未完成
            </button>
          )}
        </div>
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

      {chatVisible && !showAll && (
        <StepChat
          key={step.id}
          settings={settings}
          task={task}
          steps={steps}
          step={step}
          onAsk={() => openChat(step)}
          onSizeChange={(n) => setThreadSizes((m) => ({ ...m, [step.id]: n }))}
        />
      )}
    </div>
  );
}
