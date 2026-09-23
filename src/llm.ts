import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import {
  buildQaRequest,
  DECOMPOSE_SYSTEM,
  DecompositionSchema,
  decomposeUserMessage,
  type Decomposition,
} from "./prompts";
import type { Settings } from "./settings";
import type { ChatMessage, Step, Task } from "./types";

export class LlmError extends Error {}

function client(settings: Settings) {
  if (!settings.apiKey) throw new LlmError("还没有填 API key，先到「设置」里填一下。");
  // 自带 key、直接从扩展页面请求 api.anthropic.com
  return new Anthropic({ apiKey: settings.apiKey, dangerouslyAllowBrowser: true });
}

/** Opus 5 被安全分类器拒答时，服务端自动换模型重跑 */
function fallbackParams(model: string) {
  return model === "claude-opus-5"
    ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const }
    : {};
}

function checkStop(msg: Anthropic.Beta.BetaMessage) {
  if (msg.stop_reason === "refusal") {
    throw new LlmError("模型拒绝处理这段内容。" + (msg.stop_details?.explanation ?? ""));
  }
}

export function describeError(err: unknown): string {
  if (err instanceof LlmError) return err.message;
  if (err instanceof Anthropic.AuthenticationError) return "API key 无效，检查一下「设置」里的 key。";
  if (err instanceof Anthropic.PermissionDeniedError) return "这个 API key 没有权限使用所选模型。";
  if (err instanceof Anthropic.NotFoundError) return "找不到所选模型，换一个模型试试。";
  if (err instanceof Anthropic.RateLimitError) return "请求太频繁或额度用完了，稍后再试。";
  if (err instanceof Anthropic.APIConnectionError) return "连不上 api.anthropic.com，检查网络或代理。";
  if (err instanceof Anthropic.APIError) return `API 出错（${err.status ?? "?"}）：${err.message}`;
  if (err instanceof Error) return err.message;
  return String(err);
}

export async function decompose(
  settings: Settings,
  sourceText: string,
  sourceUrl: string | undefined,
  onProgress: (chars: number) => void,
  signal?: AbortSignal,
): Promise<Decomposition> {
  const stream = client(settings).beta.messages.stream(
    {
      model: settings.model,
      max_tokens: 32000,
      system: DECOMPOSE_SYSTEM,
      messages: [{ role: "user", content: decomposeUserMessage(sourceText, sourceUrl) }],
      output_config: { format: betaZodOutputFormat(DecompositionSchema) },
      ...fallbackParams(settings.model),
    },
    { signal },
  );
  let chars = 0;
  stream.on("text", (delta) => onProgress((chars += delta.length)));
  const msg = await stream.finalMessage();
  checkStop(msg);
  if (msg.stop_reason === "max_tokens") throw new LlmError("原文太长，拆解结果被截断了。试试分段粘贴。");
  const text = msg.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new LlmError("拆解结果不是合法 JSON，重试一次。");
  }
  const parsed = DecompositionSchema.safeParse(json);
  if (!parsed.success || parsed.data.steps.length === 0) throw new LlmError("没拆出步骤，确认粘贴的是一篇教程再试。");
  return parsed.data;
}

/** 步骤内追问，流式返回；history 最后一条是本次提问 */
export async function askAboutStep(
  settings: Settings,
  task: Task,
  steps: Step[],
  step: Step,
  history: ChatMessage[],
  onText: (full: string) => void,
  signal?: AbortSignal,
): Promise<string> {
  const { system, messages } = buildQaRequest(task, steps, step, history);
  const stream = client(settings).beta.messages.stream(
    { model: settings.model, max_tokens: 16000, system, messages, ...fallbackParams(settings.model) },
    { signal },
  );
  let full = "";
  stream.on("text", (delta) => onText((full += delta)));
  const msg = await stream.finalMessage();
  checkStop(msg);
  return full;
}
