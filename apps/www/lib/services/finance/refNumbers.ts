import type { TenantTx } from "@/lib/db/scope";

/**
 * Race-free reference numbers backed by Postgres sequences (migration
 * 00000000000003). `nextval` is atomic and non-transactional, so concurrent
 * ledger writers never collide on the unique ref/invoice number — replacing the
 * old `count()+1` scheme which produced duplicate numbers (and a P2002 abort)
 * whenever two transactions ran in the same instant.
 *
 * Non-transactional means a rolled-back write can leave a gap in the series;
 * that is fine — the numbers must be unique, not gapless.
 */
async function nextval(tx: TenantTx, seq: "txn_ref_seq" | "invoice_ref_seq"): Promise<number> {
  // seq is a fixed internal literal (never user input) — safe to interpolate.
  const rows = await tx.$queryRawUnsafe<{ nextval: bigint }[]>(`SELECT nextval('${seq}')`);
  return Number(rows[0].nextval);
}

export async function nextTxnRef(tx: TenantTx): Promise<string> {
  const n = await nextval(tx, "txn_ref_seq");
  return `TXN-${new Date().getFullYear()}-${String(n).padStart(5, "0")}`;
}

/**
 * Batched: `count` transaction refs in a SINGLE round-trip. Cuts latency (and
 * cold-start transaction-timeout risk) when a distribution/refund writes several
 * ledger rows at once. `count` is an internal integer, never user input.
 */
export async function nextTxnRefs(tx: TenantTx, count: number): Promise<string[]> {
  const n = Math.max(0, Math.floor(count));
  if (n === 0) return [];
  const rows = await tx.$queryRawUnsafe<{ n: bigint }[]>(
    `SELECT nextval('txn_ref_seq') AS n FROM generate_series(1, ${n})`,
  );
  const year = new Date().getFullYear();
  return rows.map((r) => `TXN-${year}-${String(Number(r.n)).padStart(5, "0")}`);
}

export async function nextInvoiceRef(tx: TenantTx): Promise<string> {
  const n = await nextval(tx, "invoice_ref_seq");
  return `INV-${new Date().getFullYear()}-${String(n).padStart(5, "0")}`;
}
