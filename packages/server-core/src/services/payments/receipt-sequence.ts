import type { TenantTx } from "../../db/scope";
import { NotFoundError } from "../../errors/classes";

function formatReceiptNumber(shortId: string, seq: number): string {
  const year = new Date().getFullYear();
  return `RCP-${shortId}-${year}-${String(seq).padStart(5, "0")}`;
}

/**
 * The one place a receipt number is minted. Extracted when `refundPayment`
 * arrived: a second copy of the format would drift, and the `centers` row
 * UPDATE is also what serialises concurrent counter writes for a centre, so
 * both callers need the same lock at the same point.
 */
export async function nextReceiptNumber(tx: TenantTx, centerId: string): Promise<string> {
  try {
    const center = await tx.center.update({
      where: { id: centerId },
      data: { receiptSeq: { increment: 1 } },
    });
    return formatReceiptNumber(center.shortId, center.receiptSeq);
  } catch (err) {
    if ((err as { code?: string }).code === "P2025") throw new NotFoundError("Center not found");
    throw err;
  }
}
