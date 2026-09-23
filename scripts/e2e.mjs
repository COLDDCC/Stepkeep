// 冒烟测试：在 Chromium 里加载 dist/ 扩展，mock 掉 api.anthropic.com，走一遍
// 设置 key → 粘贴导入 → 拆解 → 追问 → 标记完成/卡住 → 重开后落回上次步骤。
// 用法：npm run build && npm run e2e（可用 CHROMIUM_PATH 指定浏览器，SHOTS_DIR 保存截图）
import { mkdtempSync } from "fs";
import os from "os";
import path from "path";
import { chromium } from "playwright";

const ext = path.resolve("dist");
const shotsDir = process.env.SHOTS_DIR;
const ctx = await chromium.launchPersistentContext(mkdtempSync(path.join(os.tmpdir(), "stepkeep-")), {
  executablePath: process.env.CHROMIUM_PATH,
  headless: true,
  args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`],
  viewport: { width: 400, height: 900 },
});
const sw = ctx.serviceWorkers()[0] ?? (await ctx.waitForEvent("serviceworker"));
const extId = sw.url().split("/")[2];

const decomposition = {
  title: "把个人网站部署到 Cloudflare Pages",
  steps: [
    { title: "安装 Wrangler CLI", body: "在终端运行：\n\n```bash\nnpm install -g wrangler\n```", done_criteria: "`wrangler --version` 输出版本号", cautions: ["需要 Node.js 18 以上"] },
    { title: "登录 Cloudflare 账号", body: "```bash\nwrangler login\n```\n浏览器会弹出授权页，点 **Allow**。", done_criteria: "终端显示 Successfully logged in", cautions: [] },
    { title: "构建并发布站点", body: "```bash\nnpm run build\nwrangler pages deploy dist\n```", done_criteria: "终端输出 *.pages.dev 地址并能打开", cautions: [] },
    {
      title: "（可选）绑定自定义域名",
      body: "在 Pages 项目 → Custom domains 添加域名。\n\n- **域名在 Cloudflare**：自动添加 CNAME\n- **域名在别处**：手动加 CNAME 指向 `xxx.pages.dev`",
      done_criteria: "访问自定义域名能看到站点",
      cautions: [],
    },
  ],
};
const answer = "这是 Node 全局目录权限问题。改用：\n\n```bash\nsudo npm install -g wrangler\n```\n\n或者用 `npx wrangler` 免安装。";

function sse(text) {
  const ev = (type, data) => `event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`;
  const message = {
    id: "msg_1", type: "message", role: "assistant", model: "claude-opus-5", content: [],
    stop_reason: null, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 0 },
  };
  return [
    ev("message_start", { message }),
    ev("content_block_start", { index: 0, content_block: { type: "text", text: "" } }),
    ...text.match(/[\s\S]{1,40}/g).map((t) => ev("content_block_delta", { index: 0, delta: { type: "text_delta", text: t } })),
    ev("content_block_stop", { index: 0 }),
    ev("message_delta", { delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 50 } }),
    ev("message_stop", {}),
  ].join("");
}

const requests = [];
await ctx.route("https://api.anthropic.com/**", async (route) => {
  const body = JSON.parse(route.request().postData());
  requests.push({ headers: route.request().headers(), body });
  const text = body.output_config ? JSON.stringify(decomposition) : answer;
  await route.fulfill({ status: 200, headers: { "content-type": "text/event-stream" }, body: sse(text) });
});

const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const shot = (name) => shotsDir && page.screenshot({ path: path.join(shotsDir, `${name}.png`), fullPage: true });
const assert = (cond, msg) => {
  if (!cond) throw new Error("断言失败：" + msg);
};

await page.goto(`chrome-extension://${extId}/sidepanel.html`);
await page.getByText("还没填 Claude API key").waitFor();
await shot("1-empty");
await page.getByRole("button", { name: "设置", exact: true }).click();
await page.getByPlaceholder("sk-ant-…").fill("sk-ant-test");
await page.getByRole("button", { name: "保存" }).click();
await page.getByRole("button", { name: "+ 新任务" }).click();
await page.getByPlaceholder(/粘贴 AI 长回复/).fill("教程原文：先装 wrangler，再登录，再部署……");
await shot("2-import");
await page.getByRole("button", { name: "拆成步骤" }).click();
await page.getByRole("heading", { name: "安装 Wrangler CLI" }).waitFor();
assert(await page.locator(".step-note").getByText("需要 Node.js 18 以上").isVisible(), "显示注意事项");
await shot("3-step1");

await page.getByRole("button", { name: "卡住了？问一下" }).click();
await page.getByPlaceholder(/卡在哪了/).fill("npm install -g 报 EACCES 权限错误");
await page.getByRole("button", { name: "发送" }).click();
await page.getByText("免安装").waitFor();
assert((await page.locator(".dot.current.stuck").count()) === 1, "点「卡住了」后当前步骤标为卡住");
await shot("4-asked");

await page.getByRole("button", { name: "下一步", exact: true }).click();
await page.getByRole("heading", { name: "登录 Cloudflare 账号" }).waitFor();
await page.getByRole("button", { name: "下一步", exact: true }).click();
await page.getByRole("heading", { name: "构建并发布站点" }).waitFor();
await page.getByRole("button", { name: "卡住了？问一下" }).click();
assert(await page.getByPlaceholder(/卡在哪了/).isVisible(), "展开追问框");
await page.locator(".dot.current.stuck").waitFor();
await shot("5-step3-stuck");

// 关掉再打开：总览显示「卡在 3/4」，点进去直接落在第 3 步
await page.reload();
await page.getByText("卡在 3/4").waitFor();
await shot("6-overview");
await page.getByText(decomposition.title).click();
await page.getByRole("heading", { name: "构建并发布站点" }).waitFor();
// 「全部步骤」列表能跳转
await page.getByRole("button", { name: "全部步骤" }).click();
assert((await page.locator(".all-step").count()) === 4, "全部步骤列出 4 步");
await page.getByRole("button", { name: "返回当前步骤" }).click();
// 第 1 步的追问线程还在（有记录的步骤自动展开追问）
await page.locator(".dots .dot").first().click();
await page.getByText("免安装").waitFor();

const qa = requests[1];
assert(requests.length === 2, "共 2 次 API 请求");
assert(qa.headers["anthropic-dangerous-direct-browser-access"] === "true", "浏览器直连头");
assert(qa.body.fallbacks === "default", "Opus 5 开启 fallbacks");
assert(qa.body.system[1].cache_control?.type === "ephemeral", "原文带缓存断点");
assert(qa.body.messages[0].content.includes("<当前步骤"), "追问带上当前步骤");
assert(errors.length === 0, "页面无报错：" + errors.join("; "));
console.log("e2e OK");
await ctx.close();
