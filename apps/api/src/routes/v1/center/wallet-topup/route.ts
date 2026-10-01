import { z } from "zod";
import { centerStaff, RECEPTION } from "@repo/server-core/authz/center-actor";
import { ok } from "@repo/server-core/http/envelope";
import { parseJson } from "@repo/server-core/validation/zod";
import { topUpWalletCash } from "@repo/server-core/services/wallet/wallet-facade";

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
