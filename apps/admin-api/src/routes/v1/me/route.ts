import { z } from "zod";
import { withErrors } from "@repo/server-core/errors/http";
import { requireSession } from "@repo/server-core/backoffice-auth/session";
import { ok } from "@repo/server-core/http/envelope";
import { parseJson } from "@repo/server-core/validation/zod";
import { phoneSchema } from "@repo/server-core/validation/common";
import { getOwnProfile, updateOwnProfile } from "@repo/server-core/backoffice/account/profile";

export const GET = withErrors(async () => {
  const session = await requireSession();
  return ok(await getOwnProfile(session));
});

const patchSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  phone: phoneSchema.optional(),
  locale: z.enum(["ar", "en"]).optional(),
});

export const PATCH = withErrors(async (req) => {
  const session = await requireSession();
  const body = await parseJson(req, patchSchema);
  return ok(await updateOwnProfile(session, body));
});
