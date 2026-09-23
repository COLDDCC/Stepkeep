import { useState } from "preact/hooks";
import { MODELS, saveSettings, type Settings } from "../settings";
import type { Route } from "./App";

export function SettingsView({
  settings,
  onSaved,
  go,
}: {
  settings: Settings;
  onSaved: (s: Settings) => void;
  go: (r: Route) => void;
}) {
  const [draft, setDraft] = useState(settings);

  const save = async () => {
    const next = { ...draft, apiKey: draft.apiKey.trim() };
    await saveSettings(next);
    onSaved(next);
    go({ name: "list" });
  };

  return (
    <div class="page">
      <header class="bar">
        <button class="btn ghost" onClick={() => go({ name: "list" })}>
          ← 返回
        </button>
        <h2 class="bar-title">设置</h2>
      </header>

      <label class="field">
        <span>Claude API key</span>
        <input
          type="password"
          placeholder="sk-ant-…"
          autocomplete="off"
          value={draft.apiKey}
          onInput={(e) => setDraft({ ...draft, apiKey: e.currentTarget.value })}
        />
        <small class="muted">
          只保存在本机浏览器里，请求直接发往 api.anthropic.com。在 console.anthropic.com 创建。
        </small>
      </label>

      <label class="field">
        <span>模型</span>
        <select value={draft.model} onChange={(e) => setDraft({ ...draft, model: e.currentTarget.value })}>
          {MODELS.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
        <small class="muted">拆解和追问都用这个模型。每次拆解、每次追问都会消耗 token。</small>
      </label>

      <div class="row-end">
        <button class="btn primary" onClick={save}>
          保存
        </button>
      </div>
    </div>
  );
}
