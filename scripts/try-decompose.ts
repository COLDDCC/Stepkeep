// 用真实模型试拆一篇教程，打印拆解结果，用来调提示词。
// 用法：ANTHROPIC_API_KEY=sk-ant-... npm run try -- cases/reddit-signup.md [模型]
import Anthropic from "@anthropic-ai/sdk";
import { readFileSync } from "node:fs";
import { DecompositionSchema, decomposeRequest } from "../src/prompts.ts";

const [file, model = "claude-opus-5"] = process.argv.slice(2);
if (!file) {
  console.error("用法：npm run try -- <教程文件> [模型]");
  process.exit(1);
}

if (!process.env.ANTHROPIC_API_KEY) {
  console.error("先设置环境变量 ANTHROPIC_API_KEY");
  process.exit(1);
}

const client = new Anthropic();
const msg = await client.beta.messages.stream(decomposeRequest(model, readFileSync(file, "utf8"))).finalMessage();
if (msg.stop_reason !== "end_turn") console.error(`stop_reason: ${msg.stop_reason}`);
const text = msg.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
const result = DecompositionSchema.parse(JSON.parse(text));

console.log(`# ${result.title}\n`);
result.steps.forEach((s, i) => {
  console.log(`## ${i + 1}. ${s.title}\n\n${s.body}\n`);
  for (const c of s.cautions) console.log(`> ⚠️ ${c}`);
  console.log(`> ✅ ${s.done_criteria}\n`);
});
const u = msg.usage;
console.error(`tokens: in ${u.input_tokens} / out ${u.output_tokens}`);
