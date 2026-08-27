import { z } from "zod";
import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { updateGlobalM2Rate, clearGlobalM2Rate } from "@/lib/services/admin/rooms-split";

export const dynamic = "force-dynamic";

const rateSchema = z
  .object({
    fee: z.number().int().min(0).max(99_999_900).nullable(),
    bp: z.number().int().min(0).max(10_000).nullable(),
  })
  .strict()
  .refine((r) => (r.fee != null) !== (r.bp != null), {
    message: "Set exactly one of fee (piasters/student) or bp (basis points/student)",
  });

export const PUT = withErrors(async (req) => {
  const user = await requireRole("super_admin");
  const body = await parseJson(req, rateSchema);
  return ok(await updateGlobalM2Rate(body, user));
});

export const DELETE = withErrors(async () => {
  const user = await requireRole("super_admin");
  return ok(await clearGlobalM2Rate(user));
});
