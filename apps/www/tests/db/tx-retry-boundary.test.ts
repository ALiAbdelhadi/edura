// TX-RETRY proof — `transactionWithRetry` may retry a dropped connection, but
// it must NEVER retry one that dropped during COMMIT.
//
// This guards a money boundary. `withTenant`/`withPlatformContext` carry every
// payment, settlement and ledger write, so a retry in the wrong window applies
// the whole transaction body TWICE. The three windows:
//
//   before the body is entered  -> BEGIN never succeeded; nothing ran.   RETRY
//   while the body is running   -> the transaction is open and uncommitted;
//                                  the server rolls it back when the
//                                  connection dies.                      RETRY
//   after the body RETURNED     -> COMMIT is in flight. "never arrived" and
//                                  "committed, ack lost" are
//                                  indistinguishable.                 NO RETRY
//
// Drives the REAL `withPlatformContext` against the live DB. Nothing is mocked:
// the only thing simulated is the drop itself, done by destroying the actual
// TCP socket — which is what a Neon proxy drop looks like — and the assertion
// is a COUNT OF BODY EXECUTIONS, because 2 is precisely the double-charge.
import { neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import { withPlatformContext } from "@repo/database";

import { assertDbEnv } from "../../../../packages/database/scripts/db-guard";

// Wrap `ws` so we can reach the live sockets. Assigned through neonConfig, so
// the neon-ws.ts hardening wraps this exactly as it wraps a plain `ws`.
const live = new Set<unknown>();
class CapturingWebSocket extends (ws as unknown as {
  new (...args: unknown[]): { addEventListener(t: string, l: () => void): void };
}) {
  constructor(...args: unknown[]) {
    super(...args);
    live.add(this);
    this.addEventListener("close", () => live.delete(this));
  }
}
neonConfig.webSocketConstructor = CapturingWebSocket as never;

/** Destroy the real TCP socket: a faithful drop, with no further bytes. */
function drop() {
  for (const s of live) {
    (s as { _socket?: { destroy(e: Error): void } })._socket?.destroy(
      Object.assign(new Error("read ECONNRESET"), { code: "ECONNRESET" }),
    );
  }
}

let pass = 0;
let fail = 0;
function assert(cond: boolean, msg: string) {
  if (cond) {
    pass++;
    console.log("  ✓", msg);
  } else {
    fail++;
    console.error("  ✗", msg);
  }
}

async function main() {
  // Warm the pool so there is a socket to drop.
  await withPlatformContext((tx) => tx.$queryRaw`SELECT 1`);

  // ---- 1. drop WHILE the body runs -> retried, and the call succeeds ------
  {
    let bodyRuns = 0;
    let threw: unknown;
    try {
      await withPlatformContext(async (tx) => {
        bodyRuns++;
        if (bodyRuns === 1) setTimeout(drop, 20);
        await tx.$queryRaw`SELECT pg_sleep(0.4)::text AS x`;
        return tx.$queryRaw`SELECT 1`;
      });
    } catch (e) {
      threw = e;
    }
    assert(bodyRuns === 2, `drop mid-body is retried (body ran ${bodyRuns}x, expected 2)`);
    assert(!threw, "drop mid-body ultimately succeeds");
  }

  // ---- 2. drop during COMMIT -> NOT retried ------------------------------
  // The safety-critical case. A second body execution here would be a
  // double-charge on a transaction that may well have committed.
  {
    let bodyRuns = 0;
    let threw: unknown;
    try {
      await withPlatformContext(async (tx) => {
        bodyRuns++;
        await tx.$queryRaw`SELECT 1`;
        // Lands on COMMIT: scheduled as the body resolves.
        setImmediate(drop);
        return 1;
      });
    } catch (e) {
      threw = e;
    }
    assert(
      bodyRuns === 1,
      `drop during COMMIT is NOT retried — no double-apply (body ran ${bodyRuns}x, expected 1)`,
    );
    assert(!!threw, "drop during COMMIT surfaces as an error rather than a silent retry");
  }

  // ---- 3. no drop -> exactly one execution -------------------------------
  {
    let bodyRuns = 0;
    await withPlatformContext(async (tx) => {
      bodyRuns++;
      return tx.$queryRaw`SELECT 1`;
    });
    assert(bodyRuns === 1, "an undisturbed transaction runs its body exactly once");
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

// The environment guard runs BEFORE main(), so invoking this file directly
// (which bypasses the `pretest:db` step) cannot write to dev or production.
assertDbEnv(["test"], { intent: "suite tx-retry-boundary.test.ts" })
  .then(() => main())
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
