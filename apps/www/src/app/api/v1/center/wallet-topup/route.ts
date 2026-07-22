import { z } from "zod";
import { centerStaff, RECEPTION } from "@/lib/authz/center-actor";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { topUpWalletCash } from "@/lib/services/wallet/wallet";

export const dynamic = "force-dynamic";

// Center staff record a CASH top-up into a roster student's wallet. Credit-only
// — there is no center-facing wallet debit/withdraw path. The credit is a
// traceable ledger entry (recordedBy = staff, centerId = crediting center).
// When a RECEPTIONIST records it, `acting.id` is the staff's own id, so the
// ledger's recordedBy traces to the staff member on-behalf-of the center.
const bodySchema = z
  .object({
    studentId: z.string().uuid(),
    amount: z.number().int().positive(),
  })
  .strict();

export const POST = centerStaff(
  async (req, _ctx, { acting: user }) => {
    const body = await parseJson(req, bodySchema);
    return ok(await topUpWalletCash(body, user), { status: 201 });
  },
  { allow: RECEPTION },
);
