import { testPool } from "../../../../packages/database/scripts/test-pool";
import { requestTeacherPayout } from "@repo/server-core/services/finance/teacher-wallet";
import type { SessionUser } from "@repo/server-core/erp-auth/session";

import { assertDbEnv } from "../../../../packages/database/scripts/db-guard";
import { sweepTagQuietly } from "../../../../packages/database/scripts/test-cleanup";
import { createTeacherFixture } from "../../../../packages/database/scripts/payout-fixtures";
const admin = testPool();

const SUITE_NAME = "teacher-payout-replay.test.ts";
let __sweepTag = "";
let TEACHER = "";
const BAL = 10_000; // 100 EGP
const rid = () => Math.floor(Math.random() * 1e9).toString(36);

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


async function openPayouts() {
  const r = await admin.query(
    `SELECT COALESCE(SUM(net_payable),0)::int AS total, COUNT(*)::int AS n,
            ARRAY_AGG(id::text) AS ids
       FROM payouts WHERE beneficiary_id=$1 AND status IN ('pending','approved')`,
    [TEACHER],
  );
  return {
    total: r.rows[0].total as number,
    n: r.rows[0].n as number,
    ids: (r.rows[0].ids ?? []) as string[],
  };
}

async function main() {
  const tag = "tpr-" + rid();
  __sweepTag = tag;
  TEACHER = (await createTeacherFixture(tag, BAL)).userId;
  console.log(`  fixture owned by this suite (tag ${tag}): teacher=${TEACHER}`);
  const teacher = { id: TEACHER, role: "teacher", locale: "en" } as SessionUser;

  const refusal = async (amount?: number): Promise<string> => {
    try {
      await requestTeacherPayout(teacher, amount);
      return "";
    } catch (e) {
      return (e as Error).message;
    }
  };

  try {
    // 1. Partial request, then the same request again (the timeout-retry shape
    //    the client cannot distinguish from a fresh intent).
    const first = (await requestTeacherPayout(teacher, 4_000)) as { id: string };
    const retry = (await requestTeacherPayout(teacher, 4_000)) as { id: string };
    assert(retry.id === first.id, "an identical retry returns the existing pending payout");
    let open = await openPayouts();
    assert(open.n === 1 && open.total === 4_000, "exactly one payout row exists after the retry");

    // 2. A different amount is a new intent, not a replay.
    const other = (await requestTeacherPayout(teacher, 2_000)) as { id: string };
    assert(other.id !== first.id, "a different amount creates a distinct payout");
    open = await openPayouts();
    assert(open.n === 2 && open.total === 6_000, "two payouts reserved after the second intent");

    // 3. Over-requesting is still refused on availability (H1 behaviour intact).
    //    5_000 collides with no pending row, so the replay guard cannot mask it.
    assert(
      /exceeds available balance/i.test(await refusal(5_000)),
      "an amount above the available balance is refused",
    );
    open = await openPayouts();
    assert(open.n === 2 && open.total === 6_000, "the refused request reserved nothing");

    // 4. Draining the rest with distinct amounts leaves nothing available.
    await requestTeacherPayout(teacher, 1_000);
    await requestTeacherPayout(teacher, 3_000);
    open = await openPayouts();
    assert(open.n === 4 && open.total === BAL, "reserved payouts sum to exactly the wallet balance");

    // 5. THE ORDERING THAT MATTERS: availability is checked BEFORE the replay
    //    guard, so an exhausted wallet refuses even an amount that matches a
    //    pending row. The guard can never resurrect money past the floor.
    assert(
      /no available balance/i.test(await refusal(1_000)),
      "an exhausted balance refuses even an amount identical to a pending payout",
    );
    assert(
      /no available balance/i.test(await refusal()),
      "an exhausted balance refuses a full-balance request",
    );
    open = await openPayouts();
    assert(
      open.n === 4 && open.total === BAL,
      "no payout was ever reserved beyond the wallet balance",
    );

    // ---- keyed idempotency ----
    // Reset to a clean wallet for the keyed block.
    await admin.query(
      `DELETE FROM payouts WHERE beneficiary_id=$1 AND status IN ('pending','approved')`,
      [TEACHER],
    );

    // 6. A keyed request and its exact retry are ONE payout.
    const keyA = `test-key-${rid()}`;
    const k1 = (await requestTeacherPayout(teacher, 3_000, keyA)) as { id: string };
    const k2 = (await requestTeacherPayout(teacher, 3_000, keyA)) as { id: string };
    assert(k1.id === k2.id, "a keyed retry returns the same payout row");

    // 7. The key is the identity, not the amount: a DIFFERENT amount under the
    //    SAME key still resolves to the original request.
    const k3 = (await requestTeacherPayout(teacher, 9_999, keyA)) as { id: string };
    assert(k3.id === k1.id, "the key wins over the amount — same key, same payout");

    // 8. A fresh key with the same amount INSIDE the replay window: the
    //    amount-based guard still collapses it (it runs after availability and
    //    knows nothing of keys). Pinned so nobody "fixes" it by accident.
    const k4 = (await requestTeacherPayout(teacher, 3_000, `test-key-${rid()}`)) as {
      id: string;
    };
    assert(
      k4.id === k1.id,
      "a fresh key with an identical amount inside the window is still deduped",
    );

    // 9. THE POINT OF THE COLUMN: a keyed retry of a request that consumed the
    //    remaining balance returns that same row where a keyless retry errors.
    const keyB = `test-key-${rid()}`;
    const k5 = (await requestTeacherPayout(teacher, undefined, keyB)) as { id: string }; // drain: 7_000
    const k6 = (await requestTeacherPayout(teacher, undefined, keyB)) as { id: string };
    assert(k5.id === k6.id, "a keyed full-balance retry survives an exhausted balance");
    assert(
      /no available balance/i.test(await refusal()),
      "a keyless request against the exhausted balance still refuses",
    );
    open = await openPayouts();
    assert(open.n === 2 && open.total === BAL, "keyed retries reserved nothing extra");

    // 10. Another beneficiary reusing the same key is not blocked (composite
    //     unique on beneficiary+key). Proven at the index level.
    //     This used to borrow whichever OTHER teacher happened to exist and
    //     skip itself when there was none -- which is what it did on the test
    //     branch, so the composite unique was never actually exercised here.
    const otherTeacher = await createTeacherFixture(tag, 0, "t2");
    const ins = await admin
      .query(
        `INSERT INTO payouts (beneficiary_id, beneficiary_type, net_payable, status, client_request_id)
         VALUES ($1, 'teacher', 100, 'pending', $2) RETURNING id`,
        [otherTeacher.userId, keyA],
      )
      .then(
        (r) => ({ ok: true, id: r.rows[0].id as string }),
        () => ({ ok: false, id: "" }),
      );
    assert(ins.ok, "the same key under a different beneficiary is not blocked");
  } finally {
    await admin.end();
  }

  console.log(
    `\n${fail === 0 ? "PAYOUT-REPLAY PROOF PASS ✔" : "PAYOUT-REPLAY PROOF FAIL ✗"} (${pass} passed, ${fail} failed)`,
  );
  process.exitCode = fail === 0 ? 0 : 1;
}

async function runGuarded() {
  await assertDbEnv(["test"], { intent: `suite ${SUITE_NAME}` });
  try {
    await main();
  } catch (e) {
    console.error(e);
    process.exitCode = 1;
  } finally {
    if (__sweepTag) await sweepTagQuietly(__sweepTag);
  }
  process.exit(process.exitCode ?? 0);
}

runGuarded().catch((e) => {
  console.error(e);
  process.exit(1);
});
