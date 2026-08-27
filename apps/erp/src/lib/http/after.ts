import { after } from "next/server";

export function runAfter(task: () => unknown): void {
  try {
    after(task);
  } catch {
    void Promise.resolve().then(task).catch(() => undefined);
  }
}
