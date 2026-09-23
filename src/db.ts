import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { Note, Step, Task, Thread } from "./types";

interface StepkeepDB extends DBSchema {
  tasks: { key: string; value: Task; indexes: { byUpdated: number } };
  steps: { key: string; value: Step; indexes: { byTask: string } };
  threads: { key: string; value: Thread; indexes: { byTask: string } };
  notes: { key: string; value: Note; indexes: { byTask: string } };
}

let dbPromise: Promise<IDBPDatabase<StepkeepDB>> | null = null;

function db() {
  dbPromise ??= openDB<StepkeepDB>("stepkeep", 1, {
    upgrade(d) {
      d.createObjectStore("tasks", { keyPath: "id" }).createIndex("byUpdated", "updatedAt");
      d.createObjectStore("steps", { keyPath: "id" }).createIndex("byTask", "taskId");
      d.createObjectStore("threads", { keyPath: "stepId" }).createIndex("byTask", "taskId");
      d.createObjectStore("notes", { keyPath: "stepId" }).createIndex("byTask", "taskId");
    },
  });
  return dbPromise;
}

/** 最近更新的在前 */
export async function listTasks(): Promise<Task[]> {
  const all = await (await db()).getAllFromIndex("tasks", "byUpdated");
  return all.reverse();
}

export async function getTask(id: string) {
  return (await db()).get("tasks", id);
}

export async function getSteps(taskId: string): Promise<Step[]> {
  const steps = await (await db()).getAllFromIndex("steps", "byTask", taskId);
  return steps.sort((a, b) => a.index - b.index);
}

export async function createTask(task: Task, steps: Step[]) {
  const tx = (await db()).transaction(["tasks", "steps"], "readwrite");
  await Promise.all([
    tx.objectStore("tasks").put(task),
    ...steps.map((s) => tx.objectStore("steps").put(s)),
    tx.done,
  ]);
}

export async function putTask(task: Task) {
  await (await db()).put("tasks", task);
}

export async function putStep(step: Step) {
  await (await db()).put("steps", step);
}

export async function deleteTask(taskId: string) {
  const d = await db();
  const tx = d.transaction(["tasks", "steps", "threads", "notes"], "readwrite");
  const deleteByTask = async (store: "steps" | "threads" | "notes") => {
    const keys = await tx.objectStore(store).index("byTask").getAllKeys(taskId);
    await Promise.all(keys.map((k) => tx.objectStore(store).delete(k)));
  };
  await Promise.all([
    tx.objectStore("tasks").delete(taskId),
    deleteByTask("steps"),
    deleteByTask("threads"),
    deleteByTask("notes"),
    tx.done,
  ]);
}

export async function getThread(stepId: string) {
  return (await db()).get("threads", stepId);
}

export async function getThreadsForTask(taskId: string): Promise<Thread[]> {
  return (await db()).getAllFromIndex("threads", "byTask", taskId);
}

export async function putThread(thread: Thread) {
  await (await db()).put("threads", thread);
}
