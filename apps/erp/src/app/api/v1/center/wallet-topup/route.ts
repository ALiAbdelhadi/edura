import { z } from "zod";
import { centerStaff, RECEPTION } from "@/lib/authz/center-actor";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { topUpWalletCash } from "@/lib/services/wallet/wallet";

export const dynamic = "force-dynamic";

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
