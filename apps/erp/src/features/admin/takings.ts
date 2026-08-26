export type TakingsRow = { amount?: number | null };

export type Takings = {
  net: number;
  received: number;
  refunded: number;
  receipts: number;
  refunds: number;
};

export const EMPTY_TAKINGS: Takings = {
  net: 0,
  received: 0,
  refunded: 0,
  receipts: 0,
  refunds: 0,
};

export function takingsOf(rows: readonly TakingsRow[]): Takings {
  const out = { ...EMPTY_TAKINGS };
  for (const r of rows) {
    const amount = Number(r?.amount ?? 0);
    if (!Number.isFinite(amount) || amount === 0) continue;
    if (amount > 0) {
      out.received += amount;
      out.receipts += 1;
    } else {
      out.refunded += -amount;
      out.refunds += 1;
    }
  }
  out.net = out.received - out.refunded;
  return out;
}
