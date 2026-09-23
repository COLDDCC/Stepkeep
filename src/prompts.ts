import type Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import type { ChatMessage, Step, Task } from "./types";

export const DecompositionSchema = z.object({
  title: z.string().describe("任务标题，10–20 字，说清楚要做成什么"),
  steps: z
    .array(
      z.object({
        title: z.string().describe("动词开头的一句话，例如「在 Cloudflare 添加 CNAME 记录」"),
        body: z.string().describe("Markdown 正文：这一步具体怎么做。命令和代码用 fenced code block 原样保留"),
        cautions: z
          .array(z.string())
          .describe("做这一步时必须知道的坑或不可逆操作，每条一句话；没有就给空数组"),
        done_criteria: z.string().describe("怎么确认这一步做完了，一句话、可观察"),
      }),
    )
    .describe("按执行顺序排列的步骤"),
});

export type Decomposition = z.infer<typeof DecompositionSchema>;

export const DECOMPOSE_SYSTEM = `你是 Stepkeep 的拆解器。用户会粘贴一篇教程、AI 长回复或办事指南，你要把它拆成可以逐步照做的步骤卡片。

目标：用户一次只看一张卡，照着做完就能打勾进入下一张，不需要回去翻原文。

拆分原则：
- 一张卡对应一个可以独立完成、可以确认完成的动作。太碎（「打开终端」）就合并进相邻步骤；一张卡里要做好几件不相干的事就拆开。一般 3–12 步。
- 原文里的命令、代码、配置、网址、按钮名称一字不改地保留，命令和代码放在 fenced code block 里并标注语言。
- 只拆原文里有的内容，不补充原文没说的操作。原文的背景介绍、寒暄、总结段落不单独成卡。
- 原文有分支（「如果你用 Mac……如果你用 Windows……」）时，不要拆成两条主线，放在同一张卡里用小标题或列表分别写出。
- 替代路径（「也可以用手机 App，流程一样」）不单独成卡，在相关步骤正文里用一句话提一下。
- 可选步骤在标题前加「（可选）」。
- 原文里的警告、注意事项、「坑」不要单独做成一张卡，也不要丢掉：把每一条放进它真正起作用的那一步的 cautions 里（例如「用户名不能改」放进填用户名的那一步）。前置条件（年龄、账号、系统版本）放进第一步。只影响完成之后的提醒放进最后一步。
- AI 回复末尾的延伸建议、「下一步可以……」、「如果你要，我可以帮你……」之类的追加提议不是操作步骤，直接略去。
- 链接去掉 utm_ 开头的追踪参数，其余部分保持原样；原文的出处引用链接可以附在对应步骤正文末尾。
- 完成标准写成用户能亲眼确认的现象，例如「浏览器打开 https://example.com 能看到首页」「终端输出 v20.x」。
- 用中文写标题、正文和完成标准；原文是英文时，命令、代码、界面上的英文按钮名保持原样。`;

export function decomposeUserMessage(sourceText: string, sourceUrl?: string): string {
  const src = sourceUrl ? `<来源>${sourceUrl}</来源>\n` : "";
  return `${src}<原文>\n${sourceText}\n</原文>\n\n把上面的原文拆成步骤卡片。`;
}

/** Opus 5 被安全分类器拒答时，服务端自动换模型重跑 */
export function fallbackParams(model: string) {
  return model === "claude-opus-5"
    ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const }
    : {};
}

/** 拆解请求参数；扩展和 scripts/try-decompose.ts 共用，保证本地试跑和扩展里一致 */
export function decomposeRequest(model: string, sourceText: string, sourceUrl?: string) {
  return {
    model,
    max_tokens: 32000,
    system: DECOMPOSE_SYSTEM,
    messages: [{ role: "user" as const, content: decomposeUserMessage(sourceText, sourceUrl) }],
    output_config: { format: betaZodOutputFormat(DecompositionSchema) },
    ...fallbackParams(model),
  };
}

export const QA_SYSTEM = `你是 Stepkeep 里的步骤助手。用户正在照着一篇教程逐步操作，在某一步卡住了，来问你问题。

- 回答只围绕当前这一步：帮用户把这一步做完，不要把后面的步骤提前讲一遍。
- 先给能直接照做的答案（命令、点哪里、改什么），再按需要简短解释原因。
- 用户贴报错时，先说最可能的原因和对应的修法，再列次要可能。
- 结合原文里的具体环境（工具、版本、平台）作答；原文和用户实际情况冲突时，以用户描述为准并指出差异。
- 回答用中文，简洁，用 Markdown。`;

function outline(steps: Step[]): string {
  return steps.map((s) => `${s.index + 1}. ${s.title}`).join("\n");
}

function stepContext(step: Step, total: number): string {
  const cautions = step.cautions?.length ? `\n注意：\n${step.cautions.map((c) => `- ${c}`).join("\n")}\n` : "";
  return `<当前步骤 序号="${step.index + 1}/${total}">
标题：${step.title}

${step.body}
${cautions}
完成标准：${step.doneCriteria}
</当前步骤>`;
}

/**
 * 追问请求的上下文：整篇原文 + 步骤大纲放在 system（带缓存断点，同一任务反复追问时命中缓存），
 * 当前步骤放在该线程的第一条用户消息里，之后的对话原样追加。
 */
export function buildQaRequest(
  task: Task,
  steps: Step[],
  step: Step,
  history: ChatMessage[],
): { system: Anthropic.Beta.BetaTextBlockParam[]; messages: Anthropic.Beta.BetaMessageParam[] } {
  const system: Anthropic.Beta.BetaTextBlockParam[] = [
    { type: "text", text: QA_SYSTEM },
    {
      type: "text",
      text: `<任务>${task.title}</任务>\n<原文>\n${task.sourceText}\n</原文>\n<步骤大纲>\n${outline(steps)}\n</步骤大纲>`,
      cache_control: { type: "ephemeral" },
    },
  ];
  const messages: Anthropic.Beta.BetaMessageParam[] = history.map((m, i) => ({
    role: m.role,
    content: i === 0 && m.role === "user" ? `${stepContext(step, steps.length)}\n\n${m.content}` : m.content,
  }));
  return { system, messages };
}
