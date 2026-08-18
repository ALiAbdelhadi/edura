import { after } from "next/server";

/**
 * next/server's after(), tolerant of running OUTSIDE a Next request scope.
 *
 * Route handlers use this for fire-and-forget side effects (funnel analytics)
 * so the response does not wait on them. In production there is always a
 * request scope and this is exactly after() — execution still guaranteed by
 * the runtime. But the live-DB proof suites (c01-lesson-settlement and
 * friends) invoke route handlers DIRECTLY, where after() THROWS "called
 * outside a request scope" — there the task simply runs inline instead,
 * which is the pre-after() behavior minus the await.
 *
 * Tasks passed here must be never-throw by contract (the analytics helpers
 * are); the catch below is only for after() itself refusing the scope.
 */
export function runAfter(task: () => unknown): void {
  try {
    after(task);
  } catch {
    // No request scope (direct handler invocation in tests/tooling): run
    // inline, fire-and-forget. Swallow rejections the same way after() would
    // isolate them from the response.
    void Promise.resolve().then(task).catch(() => undefined);
  }
}
