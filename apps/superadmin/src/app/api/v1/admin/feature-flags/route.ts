import { z } from "zod";
import { withRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { listFeatureFlags, setFeatureFlag } from "@/lib/services/admin/feature-flags";

export const dynamic = "force-dynamic";

export const GET = withRole("super_admin", async () => {
  return ok(await listFeatureFlags());
});

const putSchema = z
  .object({
    key: z.string().min(1).max(120),
    enabled: z.boolean(),
    note: z.string().max(500).optional(),
  })
  .strict();

export const PUT = withRole("super_admin", async (user, req) => {
  const body = await parseJson(req, putSchema);
  return ok(await setFeatureFlag(user.id, body.key, body.enabled, { note: body.note }));
});
