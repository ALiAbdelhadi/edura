import type { TenantTx } from "../../db/scope";

async function nextval(tx: TenantTx, seq: "txn_ref_seq" | "invoice_ref_seq"): Promise<number> {
  const rows = await tx.$queryRaw<{ nextval: bigint }[]>`SELECT nextval(${seq}::regclass)`;
  return Number(rows[0].nextval);
}

export async function nextTxnRef(tx: TenantTx): Promise<string> {
  const n = await nextval(tx, "txn_ref_seq");
  return `TXN-${new Date().getFullYear()}-${String(n).padStart(5, "0")}`;
}

export async function nextTxnRefs(tx: TenantTx, count: number): Promise<string[]> {
  const n = Math.max(0, Math.floor(count));
  if (n === 0) return [];
  const rows = await tx.$queryRaw<{ n: bigint }[]>`
    SELECT nextval('txn_ref_seq'::regclass) AS n FROM generate_series(1, ${n})`;
  const year = new Date().getFullYear();
  return rows.map((r) => `TXN-${year}-${String(Number(r.n)).padStart(5, "0")}`);
}

export async function nextInvoiceRef(tx: TenantTx): Promise<string> {
  const n = await nextval(tx, "invoice_ref_seq");
  return `INV-${new Date().getFullYear()}-${String(n).padStart(5, "0")}`;
}
