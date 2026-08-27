import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const realFetch = globalThis.fetch;

function stubHangingFetch() {
  globalThis.fetch = vi.fn(
    () => new Promise<Response>(() => {}),
  ) as unknown as typeof fetch;
}

async function startRequest(nodeEnv: string) {
  vi.stubEnv("NODE_ENV", nodeEnv);
  vi.resetModules();
  const { api } = await import("@/lib/api/client");
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
    expect((outcome as Error).message).toContain(
      "Request timed out: GET http://test.local/api/v1/messages/conversations",
    );
  });

  it("does NOT give up at 10s in development — the compile budget", async () => {
    const req = await startRequest("development");
    await vi.advanceTimersByTimeAsync(10_500);
    expect(req.read()).toBe("pending");

    await vi.advanceTimersByTimeAsync(30_000);
    await req.settled;
    expect(req.read()).toBeInstanceOf(Error);
  });
});

const MESSAGING = path.resolve(__dirname, "../../src/features/messaging");

const FEATURE_FILES = [
  "use-chat.ts",
  "use-groups.ts",
  "chat-screen.tsx",
  "group-panel.tsx",
];

describe("messaging loaders handle their own failures", () => {
  it.each(FEATURE_FILES)("%s has a catch for every try", (file) => {
    const src = readFileSync(path.join(MESSAGING, file), "utf8");
    const tries = src.match(/\btry\s*\{/g)?.length ?? 0;
    const catches = src.match(/\}\s*catch\b/g)?.length ?? 0;
    expect(catches).toBe(tries);
  });

  it("the conversation list distinguishes a failed load from an empty inbox", () => {
    const screen = readFileSync(path.join(MESSAGING, "chat-screen.tsx"), "utf8");
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
