import { useRef, useState } from "preact/hooks";
import { createTask } from "../db";
import { decompose, describeError } from "../llm";
import type { Settings } from "../settings";
import type { Step, Task } from "../types";
import type { Route } from "./App";

export function ImportView({ settings, go }: { settings: Settings; go: (r: Route) => void }) {
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [chars, setChars] = useState(0);
  const [error, setError] = useState("");
  const abort = useRef<AbortController | null>(null);

  const run = async () => {
    const sourceText = text.trim();
    if (!sourceText) return;
    setBusy(true);
    setError("");
    setChars(0);
    abort.current = new AbortController();
    try {
      const sourceUrl = url.trim() || undefined;
      const result = await decompose(settings, sourceText, sourceUrl, setChars, abort.current.signal);
      const now = Date.now();
      const taskId = crypto.randomUUID();
      const steps: Step[] = result.steps.map((s, index) => ({
        id: crypto.randomUUID(),
        taskId,
        index,
        title: s.title,
        body: s.body,
        doneCriteria: s.done_criteria,
        cautions: s.cautions,
        status: "todo",
      }));
      const task: Task = {
        id: taskId,
        title: result.title,
        sourceUrl,
        sourceText,
        currentStepId: steps[0].id,
        createdAt: now,
        updatedAt: now,
      };
      await createTask(task, steps);
      go({ name: "task", id: taskId });
    } catch (err) {
      if (!abort.current?.signal.aborted) setError(describeError(err));
      setBusy(false);
    }
  };

  return (
    <div class="page">
      <header class="bar">
        <button class="btn ghost" onClick={() => (abort.current?.abort(), go({ name: "list" }))}>
          ← 返回
        </button>
        <h2 class="bar-title">新任务</h2>
      </header>

      <label class="field">
        <span>教程原文</span>
        <textarea
          class="source-input"
          placeholder="粘贴 AI 长回复、博客教程或办事指南的全文……"
          value={text}
          disabled={busy}
          onInput={(e) => setText(e.currentTarget.value)}
        />
      </label>
      <label class="field">
        <span>来源链接（可选）</span>
        <input
          type="url"
          placeholder="https://"
          value={url}
          disabled={busy}
          onInput={(e) => setUrl(e.currentTarget.value)}
        />
      </label>

      {error && <div class="error">{error}</div>}

      <div class="row-end">
        {busy ? (
          <>
            <span class="muted">正在拆解…{chars > 0 && ` 已生成 ${chars} 字`}</span>
            <button class="btn" onClick={() => (abort.current?.abort(), setBusy(false))}>
              取消
            </button>
          </>
        ) : (
          <button class="btn primary" disabled={!text.trim()} onClick={run}>
            拆成步骤
          </button>
        )}
      </div>
    </div>
  );
}
