import { testPool } from "../scripts/test-pool";

/**
 * Demo-seed purge of money rows, run as the database OWNER.
 *
 * Since migration 20260909120100 (SECURITY_AUDIT.md M-04) the application role
 * cannot DELETE from `payments` or UPDATE/DELETE the three wallet ledgers, and
 * the ORM refuses `payment.delete*` for every role. A demo seed that wants to
 * start over therefore needs the owner connection — the same posture as
 * `test-cleanup.ts` and `wipe-data.ts`. Call it BEFORE the seed's own
 * transaction (the rows it removes are FK children of users the transaction
 * deletes later). Refuses to run without ADMIN_URL rather than silently
 * skipping, so a re-seed never half-purges.
 */
export async function ownerPurgeMoneyRows(input: {
  paymentCenterIds?: string[];
  walletStudentIds?: string[];
  parentWalletParentIds?: string[];
}): Promise<{ payments: number; walletLedger: number; parentWalletLedger: number }> {
  const url = process.env.ADMIN_URL;
  if (!url) {
    throw new Error(
      "demo purge: ADMIN_URL (the database OWNER connection string) is required — " +
        "since migration 20260909120100 the app role cannot delete payments or " +
        "wallet-ledger rows (SECURITY_AUDIT.md M-04).",
    );
  }
  const out = { payments: 0, walletLedger: 0, parentWalletLedger: 0 };
  const pool = testPool(url);
  try {
    if (input.walletStudentIds?.length) {
      const r = await pool.query(`DELETE FROM wallet_ledger WHERE student_id = ANY($1::uuid[])`, [
        input.walletStudentIds,
      ]);
      out.walletLedger = r.rowCount ?? 0;
    }
    if (input.parentWalletParentIds?.length) {
      const r = await pool.query(
        `DELETE FROM parent_wallet_ledger WHERE parent_id = ANY($1::uuid[])`,
        [input.parentWalletParentIds],
      );
      out.parentWalletLedger = r.rowCount ?? 0;
    }
    if (input.paymentCenterIds?.length) {
      const r = await pool.query(`DELETE FROM payments WHERE center_id = ANY($1::uuid[])`, [
        input.paymentCenterIds,
      ]);
      out.payments = r.rowCount ?? 0;
    }
  } finally {
    await pool.end();
  }
  return out;
}
