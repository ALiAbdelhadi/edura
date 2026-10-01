import { z } from "zod";
import { withRole } from "@repo/server-core/backoffice-auth/require-role";
import { ok } from "@repo/server-core/http/envelope";
import { parseJson } from "@repo/server-core/validation/zod";
import { listFeatureFlags, setFeatureFlag } from "@repo/server-core/services/platform/feature-flags";

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
