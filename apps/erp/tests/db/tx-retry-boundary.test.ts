import { neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import { withPlatformContext } from "@repo/database";

import { assertDbEnv, SUITE_SKIP_EXIT } from "../../../../packages/database/scripts/db-guard";

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
  await withPlatformContext((tx) => tx.$queryRaw`SELECT 1`);

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

  {
    let bodyRuns = 0;
    let threw: unknown;
    try {
      await withPlatformContext(async (tx) => {
        bodyRuns++;
        await tx.$queryRaw`SELECT 1`;
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

if (process.env.DATABASE_DRIVER === "pg") {
  console.log("tx-retry-boundary: DECLINED — DATABASE_DRIVER=pg");
  console.log(
    "  This suite drops a real Neon WebSocket to prove the COMMIT-window retry\n" +
      "  boundary. A plain Postgres connection has no such socket, so the drop\n" +
      "  cannot be simulated and the proof is vacuous rather than passing.\n" +
      "  Run it against a Neon endpoint (unset DATABASE_DRIVER) to exercise it:\n" +
      "    bun run db:neon:env && bun run test:db --only tx-retry-boundary",
  );
  // NOT exit 0. Exiting 0 here reported PASS on every local and CI run while
  // proving nothing (docs/follow-ups.md #11); the runner badges this SKIP and
  // says out loud that the suite proved nothing.
  process.exit(SUITE_SKIP_EXIT);
}

assertDbEnv(["test"], { intent: "suite tx-retry-boundary.test.ts" })
  .then(() => main())
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
