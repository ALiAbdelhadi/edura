import { z } from "zod";
import { withRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import {
  getGlobalCommission,
  updateGlobalCommission,
} from "@/lib/services/settings/commission-admin";

export const dynamic = "force-dynamic";

export const GET = withRole("super_admin", async () => {
  return ok(await getGlobalCommission());
});

const putSchema = z
  .object({
    teacherDirectCommissionBp: z.number().int().min(0).max(10000),
    platformTeacherFee: z.number().int().min(0),
    platformCenterFee: z.number().int().min(0),
  })
  .strict();

export const PUT = withRole("super_admin", async (user, req) => {
  const body = await parseJson(req, putSchema);
  return ok(await updateGlobalCommission(body, user));
});
