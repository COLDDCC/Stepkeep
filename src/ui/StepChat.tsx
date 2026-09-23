import { useEffect, useRef, useState } from "preact/hooks";
import { getThread, putThread } from "../db";
import { askAboutStep, describeError } from "../llm";
import type { Settings } from "../settings";
import type { ChatMessage, Step, Task } from "../types";
import { Markdown } from "./Markdown";

interface Props {
  settings: Settings;
  task: Task;
  steps: Step[];
  step: Step;
  onAsk: () => void;
  onSizeChange: (n: number) => void;
}

/** 挂在当前步骤下的追问线程：问答只属于这一步，不进主线 */
export function StepChat({ settings, task, steps, step, onAsk, onSizeChange }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [streaming, setStreaming] = useState<string | null>(null);
  const [error, setError] = useState("");
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    getThread(step.id).then((t) => setMessages(t?.messages ?? []));
    return () => abort.current?.abort();
  }, [step.id]);

  const save = async (msgs: ChatMessage[]) => {
    setMessages(msgs);
    onSizeChange(msgs.length);
    await putThread({ stepId: step.id, taskId: task.id, messages: msgs });
  };

  const request = async (history: ChatMessage[]) => {
    setError("");
    setStreaming("");
    const ctrl = (abort.current = new AbortController());
    let partial = "";
    const onText = (full: string) => setStreaming((partial = full));
    let answer: string | null = null;
    try {
      answer = await askAboutStep(settings, task, steps, step, history, onText, ctrl.signal);
    } catch (err) {
      if (!ctrl.signal.aborted) setError(describeError(err));
      else if (partial) answer = `${partial}\n\n（已停止）`;
    }
    // 流式气泡和落库的回答在同一次渲染里切换，避免闪出两条
    setStreaming(null);
    if (answer !== null) await save([...history, { role: "assistant", content: answer, at: Date.now() }]);
  };

  const send = async () => {
    const q = draft.trim();
    if (!q || streaming !== null) return;
    setDraft("");
    onAsk();
    const history = [...messages, { role: "user" as const, content: q, at: Date.now() }];
    await save(history);
    await request(history);
  };

  // 上次请求失败时最后一条是没有回答的提问，可以直接重试
  const pendingRetry = streaming === null && messages.at(-1)?.role === "user";

  return (
    <section class="chat">
      <div class="chat-head">关于第 {step.index + 1} 步的追问，不会打乱步骤</div>

      {messages.map((m, i) => (
        <div key={i} class={`msg ${m.role}`}>
          {m.role === "assistant" ? <Markdown source={m.content} /> : <div class="msg-text">{m.content}</div>}
        </div>
      ))}
      {streaming !== null && (
        <div class="msg assistant">{streaming ? <Markdown source={streaming} /> : <span class="muted">思考中…</span>}</div>
      )}

      {(error || pendingRetry) && (
        <div class="error">
          {error || "这条提问还没有回答。"}
          {pendingRetry && (
            <button class="link" onClick={() => request(messages)}>
              重试
            </button>
          )}
        </div>
      )}

      <div class="composer">
        <textarea
          rows={3}
          placeholder="卡在哪了？贴报错、描述现象，或者问概念……（Ctrl/⌘ + Enter 发送）"
          value={draft}
          onInput={(e) => setDraft(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              send();
            }
          }}
        />
        {streaming !== null ? (
          <button class="btn-outline" onClick={() => abort.current?.abort()}>
            停止
          </button>
        ) : (
          <button class="btn-solid" disabled={!draft.trim()} onClick={send}>
            发送
          </button>
        )}
      </div>
    </section>
  );
}
