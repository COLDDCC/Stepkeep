# Stepkeep

把一篇 AI 长回复或博客教程拆成可逐步执行的卡片，卡住时在当前步骤旁边直接追问，并记住每个任务做到了哪一步。

主线不被追问冲散，切回来就落在上次那一步。

## v0.1（自用版）包含

- **粘贴导入 + LLM 拆解**：粘贴原文，Claude 拆成步骤（标题、正文、命令/代码块、完成标准），原文保留可随时对照
- **单步视图**：视觉参照 claude.ai 的步骤卡片，一次只看一张卡，底部数字圆点切步，「全部步骤」看列表；「下一步」会把当前步记为完成并跳到下一个没做完的步骤；代码块一键复制
- **步骤内追问**：卡片下方「卡住了？问一下」展开追问（同时把这一步标为卡住），问答只挂在这一步下，请求自动带上整篇原文 + 当前步骤
- **多任务总览**：列出所有任务和进度（如「卡在 4/7」），卡住的排最前；点进去直接落在上次停的步骤

v0.2 计划：右键 / 整页抓取导入、回写实际做法（数据表已预留）、快捷键切步。

## 安装（开发者模式加载）

```bash
npm install
npm run build
```

1. 打开 `chrome://extensions`，右上角打开「开发者模式」
2. 点「加载已解压的扩展程序」，选择项目里的 `dist/` 目录
3. 点工具栏上的 Stepkeep 图标打开侧边栏
4. 进「设置」填 Claude API key（在 [console.anthropic.com](https://console.anthropic.com) 创建）

改代码后重新 `npm run build`，再在 `chrome://extensions` 里点刷新。

## 模型与费用

- 自带 API key，请求从扩展直接发往 `api.anthropic.com`，key 只存在本机 `chrome.storage.local`
- 默认 Claude Opus 5，设置里可换 Sonnet 5 / Haiku 4.5 省钱
- 用 Opus 5 时开启了服务端 `fallbacks: "default"`：被安全分类器误拒时自动换模型重跑
- 追问时整篇原文放在 system 并打了缓存断点，同一任务连续追问会命中 prompt cache，原文部分按缓存价计费

## 开发

```bash
npm run dev        # 普通网页里调试界面（设置退回 localStorage）
npm run typecheck
npm test           # 单元测试：进度计算、IndexedDB、追问上下文拼装
npm run e2e        # 冒烟测试：Chromium 加载 dist/，mock API 走完整流程（需先 build）
```

### 用真实教程调拆解效果

`cases/` 里放真实用过的教程原文。用真实模型试拆一篇，结果打印到终端：

```bash
ANTHROPIC_API_KEY=sk-ant-... npm run try -- cases/reddit-signup.md
ANTHROPIC_API_KEY=sk-ant-... npm run try -- cases/reddit-signup.md claude-sonnet-5
```

脚本和扩展用的是同一份拆解提示词（`src/prompts.ts`），改完提示词直接重跑就能对比。

`npm run e2e` 可用 `CHROMIUM_PATH` 指定浏览器路径，`SHOTS_DIR` 保存每一步截图。

## 结构

```
public/manifest.json     MV3 + Side Panel
public/background.js     点图标打开侧边栏
src/types.ts             Task / Step / Thread / Note
src/db.ts                IndexedDB（idb）
src/progress.ts          进度文案、断点恢复、完成后跳到哪一步
src/prompts.ts           拆解 schema 与提示词、追问上下文拼装
src/llm.ts               Claude API 调用（流式、结构化输出、错误提示）
src/ui/                  Preact 组件
```
