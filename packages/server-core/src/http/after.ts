// Work that must run once the response has gone out. The host registers how:
// Next's `after()` in the frontends, nothing in a long-running service (the
// microtask fallback is the whole story there). Outside a request scope the
// registered scheduler throws, and the task still runs on the microtask queue.
export type AfterScheduler = (task: () => unknown) => void;

let scheduler: AfterScheduler | null = null;

export function setAfterScheduler(next: AfterScheduler): void {
  scheduler = next;
}

export function runAfter(task: () => unknown): void {
  try {
    if (!scheduler) throw new Error("no after scheduler registered");
    scheduler(task);
  } catch {
    void Promise.resolve().then(task).catch(() => undefined);
  }
}
