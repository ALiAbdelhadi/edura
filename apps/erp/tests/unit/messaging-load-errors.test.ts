import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Two halves of one incident.
 *
 * The messages screen threw `TimeoutError: Request timed out: GET
 * /api/v1/messages/conversations` onto the dev overlay. Neither half of that
 * was the API's fault:
 *
 *  1. The client's 10s read budget also had to cover `next dev`'s first
 *     on-demand compile of the route (Prisma + server-core + notifications) and
 *     a Neon cold start. Both are startup cost, not slowness.
 *  2. Every loader in the messaging feature was a floating `void load()` whose
 *     body had `try { … } finally { … }` and NO catch — so any failure became
 *     an unhandled rejection, and the list then fell through to "no
 *     conversations yet", asserting an empty account we never actually saw.
 *
 * These hold both, in the two ways they can each be held.
 */

// ---------------------------------------------------------------------------
// 1. The read budget
// ---------------------------------------------------------------------------
const realFetch = globalThis.fetch;

/** A fetch that never settles, so ky's timer is the only thing that can decide. */
function stubHangingFetch() {
  globalThis.fetch = vi.fn(
    () => new Promise<Response>(() => {}),
  ) as unknown as typeof fetch;
}

/**
 * Load the SHIPPED client under a given NODE_ENV and start one request against
 * a fetch that never answers. Returns a probe for the outcome so a test can ask
 * "has it given up yet?" at any point on the fake clock.
 */
async function startRequest(nodeEnv: string) {
  vi.stubEnv("NODE_ENV", nodeEnv);
  vi.resetModules();
  const { api } = await import("@/lib/api/client");
  // Only the relative prefix is made absolute so the URL resolves under node;
  // `extend` merges, so the timeout under test is the shipped one.
  const client = api.extend({ prefix: "http://test.local/api/v1" });

  vi.useFakeTimers();
  stubHangingFetch();

  let outcome: Error | "pending" | "resolved" = "pending";
  const settled = client
    .get("messages/conversations")
    .then(
      () => {
        outcome = "resolved";
      },
      (error: Error) => {
        outcome = error;
      },
    );
  return { settled, read: () => outcome };
}

describe("api client read budget", () => {
  afterEach(() => {
    vi.useRealTimers();
    globalThis.fetch = realFetch;
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("gives up at 10s in production", async () => {
    const req = await startRequest("production");
    await vi.advanceTimersByTimeAsync(9_900);
    expect(req.read()).toBe("pending");

    await vi.advanceTimersByTimeAsync(200);
    await req.settled;
    const outcome = req.read();
    expect(outcome).toBeInstanceOf(Error);
    expect((outcome as Error).name).toBe("TimeoutError");
    // The exact string the incident reported, so this test is recognisably
    // about that error and not merely about "some rejection".
    expect((outcome as Error).message).toContain(
      "Request timed out: GET http://test.local/api/v1/messages/conversations",
    );
  });

  it("does NOT give up at 10s in development — the compile budget", async () => {
    const req = await startRequest("development");
    await vi.advanceTimersByTimeAsync(10_500);
    expect(req.read()).toBe("pending");

    // It is still a budget, not "wait forever".
    await vi.advanceTimersByTimeAsync(30_000);
    await req.settled;
    expect(req.read()).toBeInstanceOf(Error);
  });
});

// ---------------------------------------------------------------------------
// 2. No loader in the messaging feature may reject into nowhere
// ---------------------------------------------------------------------------
const MESSAGING = path.resolve(__dirname, "../../src/features/messaging");

const FEATURE_FILES = [
  "use-chat.ts",
  "use-groups.ts",
  "chat-screen.tsx",
  "group-panel.tsx",
];

describe("messaging loaders handle their own failures", () => {
  /**
   * Every `try` in this feature guards an `api` call reached from a floating
   * promise — a `void load()`, an async onClick, a socket handler. `finally`
   * alone resets the spinner and lets the rejection escape. Counting the two
   * keywords is crude on purpose: it cannot be satisfied by a comment, and it
   * fails the moment someone adds a try/finally with no catch.
   */
  it.each(FEATURE_FILES)("%s has a catch for every try", (file) => {
    const src = readFileSync(path.join(MESSAGING, file), "utf8");
    const tries = src.match(/\btry\s*\{/g)?.length ?? 0;
    const catches = src.match(/\}\s*catch\b/g)?.length ?? 0;
    expect(catches).toBe(tries);
  });

  it("the conversation list distinguishes a failed load from an empty inbox", () => {
    const screen = readFileSync(path.join(MESSAGING, "chat-screen.tsx"), "utf8");
    // The error branch must be tested BEFORE the length===0 branch, or a failed
    // load renders "no conversations yet" — the lie this fix exists to remove.
    const errorBranch = screen.indexOf("chat.conversationsError");
    const emptyBranch = screen.indexOf("chat.emptyList");
    expect(errorBranch).toBeGreaterThan(-1);
    expect(errorBranch).toBeLessThan(emptyBranch);
    expect(screen).toContain('tone="error"');
  });

  it("keeps a retry path on both panes", () => {
    const screen = readFileSync(path.join(MESSAGING, "chat-screen.tsx"), "utf8");
    const panel = readFileSync(path.join(MESSAGING, "group-panel.tsx"), "utf8");
    expect(screen).toContain("chat.refreshConversations()");
    expect(panel).toContain("ctl.refresh()");
  });
});
