export type StepStatus = "todo" | "stuck" | "done";

export interface Task {
  id: string;
  title: string;
  sourceUrl?: string;
  /** 用户粘贴的原文，随时可对照，也作为追问的上下文 */
  sourceText: string;
  currentStepId: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface Step {
  id: string;
  taskId: string;
  /** 从 0 开始 */
  index: number;
  title: string;
  /** Markdown 正文，代码块以 fenced code 形式内嵌，渲染时带复制按钮 */
  body: string;
  doneCriteria: string;
  /** 做这一步时必须知道的坑，例如「用户名注册后不能改」；v0.1 早期数据没有这个字段 */
  cautions?: string[];
  status: StepStatus;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  at: number;
}

export interface Thread {
  stepId: string;
  taskId: string;
  messages: ChatMessage[];
}

/** v0.2「回写实际做法」用，v0.1 先建表 */
export interface Note {
  stepId: string;
  taskId: string;
  text: string;
  createdAt: number;
}
