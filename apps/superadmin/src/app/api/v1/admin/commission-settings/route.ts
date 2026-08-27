import { z } from "zod";
import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import {
  getGlobalCommission,
  updateGlobalCommission,
} from "@/lib/services/settings/commission-admin";

export const dynamic = "force-dynamic";

export const GET = withErrors(async () => {
  await requireRole("super_admin");
  return ok(await getGlobalCommission());
});

const putSchema = z
  .object({
    teacherDirectCommissionBp: z.number().int().min(0).max(10000),
    platformTeacherFee: z.number().int().min(0),
    platformCenterFee: z.number().int().min(0),
  })
  .strict();

export const PUT = withErrors(async (req) => {
  const user = await requireRole("super_admin");
  const body = await parseJson(req, putSchema);
  return ok(await updateGlobalCommission(body, user));
});
