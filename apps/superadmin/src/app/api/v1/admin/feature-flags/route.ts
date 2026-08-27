import { z } from "zod";
import { requireRole } from "@/lib/authz/require-role";
import { withErrors } from "@/lib/errors/http";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { listFeatureFlags, setFeatureFlag } from "@/lib/services/admin/feature-flags";

export const dynamic = "force-dynamic";

export const GET = withErrors(async () => {
  await requireRole("super_admin");
  return ok(await listFeatureFlags());
});

const putSchema = z
  .object({
    key: z.string().min(1).max(120),
    enabled: z.boolean(),
    note: z.string().max(500).optional(),
  })
  .strict();

export const PUT = withErrors(async (req) => {
  const user = await requireRole("super_admin");
  const body = await parseJson(req, putSchema);
  return ok(await setFeatureFlag(user.id, body.key, body.enabled, { note: body.note }));
});
