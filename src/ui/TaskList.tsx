import { useEffect, useState } from "preact/hooks";
import { deleteTask, getSteps, listTasks } from "../db";
import { progressOf, type Progress } from "../progress";
import type { Settings } from "../settings";
import type { Task } from "../types";
import type { Route } from "./App";

interface Row {
  task: Task;
  progress: Progress;
  currentTitle: string;
}

export function TaskList({ settings, go }: { settings: Settings; go: (r: Route) => void }) {
  const [rows, setRows] = useState<Row[] | null>(null);

  const load = async () => {
    const tasks = await listTasks();
    setRows(
      await Promise.all(
        tasks.map(async (task) => {
          const steps = await getSteps(task.id);
          const progress = progressOf(task, steps);
          return { task, progress, currentTitle: steps[progress.position - 1]?.title ?? "" };
        }),
      ),
    );
  };

  useEffect(() => {
    load();
  }, []);

  const remove = async (e: Event, task: Task) => {
    e.stopPropagation();
    if (!confirm(`删除任务「${task.title}」？进度和追问记录都会删掉。`)) return;
    await deleteTask(task.id);
    load();
  };

  // 进行中（卡住的排最前）在上，已完成的沉底
  const order = { stuck: 0, active: 1, finished: 2 };
  const sorted = rows?.slice().sort((a, b) => order[a.progress.state] - order[b.progress.state]);

  return (
    <div class="page">
      <header class="bar">
        <h1 class="brand">Stepkeep</h1>
        <div class="bar-actions">
          <button class="btn ghost" onClick={() => go({ name: "settings" })}>
            设置
          </button>
          <button class="btn primary" onClick={() => go({ name: "import" })}>
            + 新任务
          </button>
        </div>
      </header>

      {!settings.apiKey && (
        <div class="banner">
          还没填 Claude API key。
          <button class="link" onClick={() => go({ name: "settings" })}>
            去设置
          </button>
        </div>
      )}

      {sorted && sorted.length === 0 && (
        <div class="empty">
          <p>把一篇长教程或 AI 长回复粘贴进来，拆成一步一步的卡片。</p>
          <p>卡住时在当前步骤旁追问，切走再回来，直接落在上次那一步。</p>
          <button class="btn primary" onClick={() => go({ name: "import" })}>
            导入第一篇教程
          </button>
        </div>
      )}

      <ul class="task-list">
        {sorted?.map(({ task, progress, currentTitle }) => (
          <li key={task.id} class={`task-row ${progress.state}`} onClick={() => go({ name: "task", id: task.id })}>
            <div class="task-row-main">
              <div class="task-title">{task.title}</div>
              {progress.state !== "finished" && <div class="task-current">{currentTitle}</div>}
            </div>
            <div class="task-row-side">
              <span class={`badge ${progress.state}`}>{progress.label}</span>
              <button class="icon-btn" title="删除" onClick={(e) => remove(e, task)}>
                ×
              </button>
            </div>
            <div class="bar-track">
              <div class="bar-fill" style={{ width: `${(progress.done / Math.max(progress.total, 1)) * 100}%` }} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
