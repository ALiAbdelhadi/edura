import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@repo/database";
import { __resetRateLimiterForTests } from "@repo/server-core/rate-limit/token-bucket";
import { assertDbEnv } from "../../../../packages/database/scripts/db-guard";
import { sweepTag } from "../../../../packages/database/scripts/test-cleanup";
import type { NextRouteHandler } from "../../src/next-route";
import {
  callNext,
  callService,
  closeAdminPool,
  createFixtures,
  apiRoute,
  loadNextHost,
  mount,
  serviceApp,
  signIn,
  type Call,
  type Fixtures,
} from "./harness";

// In-process latency of the same handler called the Next way (A) and through
// the service's Hono stack (B). Both sides hit the same local Postgres, so B − A
// is the cost of the Hono middleware chain and the nextRoute adapter only. The
// real Vercel → Railway network hop is not in this number and cannot be measured
// here.

const N = 300;
const WARMUP = 50;
const tag = `lat-${Math.floor(Math.random() * 1e9).toString(36)}`;
let fx: Fixtures | undefined;
let studentCookie = "";
const rows: string[] = [];

function pct(sorted: number[], p: number): number {
  const i = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[i]!;
}

async function timed(fn: () => Promise<Response>): Promise<number> {
  __resetRateLimiterForTests(); // health allows 60 per minute per IP; reset outside the timer
  const t0 = performance.now();
  const res = await fn();
  await res.arrayBuffer();
  const ms = performance.now() - t0;
  if (res.status >= 400) throw new Error(`unexpected status ${res.status}`);
  return ms;
}

async function measure(name: string, route: string, pattern: string, call: Call): Promise<void> {
  const mod = await apiRoute(route);
  const handler = mod[call.method] as NextRouteHandler | undefined;
  if (!handler) throw new Error(`${route} exports no ${call.method}`);
  const app = serviceApp();
  mount(app, call.method, pattern, handler);
  const a = () => callNext(handler, call);
  const b = () => callService(app, call);

  for (let i = 0; i < WARMUP; i++) {
    await timed(a);
    await timed(b);
  }
  const ta: number[] = [];
  const tb: number[] = [];
  // Interleaved, alternating which side goes first, so drift and GC land on both.
  for (let i = 0; i < N; i++) {
    if (i % 2 === 0) {
      ta.push(await timed(a));
      tb.push(await timed(b));
    } else {
      tb.push(await timed(b));
      ta.push(await timed(a));
    }
  }
  ta.sort((x, y) => x - y);
  tb.sort((x, y) => x - y);
  const f = (n: number) => n.toFixed(3).padStart(8);
  const [a50, a95, b50, b95] = [pct(ta, 50), pct(ta, 95), pct(tb, 50), pct(tb, 95)];
  rows.push(
    `${name.padEnd(22)} ${f(a50)} ${f(a95)} ${f(b50)} ${f(b95)} ${f(b50 - a50)} ${f(b95 - a95)}`,
  );
  expect(ta.length).toBe(N);
}

beforeAll(async () => {
  await assertDbEnv(["test"], { intent: "apps/api bench:parity" });
  await loadNextHost();
  fx = await createFixtures(tag);
  studentCookie = await signIn(fx.users.student.email, "198.18.200.1");
});

afterAll(async () => {
  try {
    if (rows.length) {
      console.log(
        [
          `\nlatency, ms (N=${N} warm iterations each, ${WARMUP} warm-up discarded, in-process, local Postgres)`,
          `${"route".padEnd(22)} ${"A p50".padStart(8)} ${"A p95".padStart(8)} ${"B p50".padStart(8)} ${"B p95".padStart(8)} ${"Δp50".padStart(8)} ${"Δp95".padStart(8)}`,
          ...rows,
          "A = handler called the Next way; B = createApp + nextRoute via app.request; Δ = B − A (Hono stack overhead).",
          "Not measured: the real Vercel → Railway network hop.",
        ].join("\n"),
      );
    }
    if (fx) {
      const swept = await sweepTag(tag, { quiet: true });
      console.log(`teardown: swept ${swept.total} rows tagged ${tag} on '${swept.dbEnv}'`);
    }
  } finally {
    await closeAdminPool();
    await prisma.$disconnect();
  }
});

describe("latency: Next shape (A) vs service stack (B)", () => {
  it("health GET", async () => {
    await measure("health GET", "health", "/api/health", { method: "GET", path: "/api/health" });
  });
  it("me GET (authenticated)", async () => {
    await measure("me GET (student)", "v1/me", "/api/v1/me", {
      method: "GET",
      path: "/api/v1/me",
      cookie: studentCookie,
    });
  });
});
