import { setAfterScheduler } from "@repo/server-core/http/after";
import { captureServerError } from "./observability";

// A long-running process has no "after the response" hook to wait on: the task
// starts now, nothing awaits it, and a rejection is logged and captured instead
// of being lost. Registered once at boot, with the service's log tag (`[api]`).
export function registerAfterScheduler(servicePrefix: string): void {
  setAfterScheduler((task) => {
    void Promise.resolve()
      .then(task)
      .catch((err: unknown) => {
        console.error(`${servicePrefix} after() task failed`, err);
        captureServerError(err, "after", null);
      });
  });
}
