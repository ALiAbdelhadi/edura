import { z } from "zod";
import { withErrors } from "@repo/server-core/errors/http";
import { requireSession } from "@repo/server-core/erp-auth/session";
import { ok } from "@repo/server-core/http/envelope";
import { parseJson } from "@repo/server-core/validation/zod";
import { getUserPrefs, updateUserPrefs } from "@repo/server-core/services/me/prefs";

export const GET = withErrors(async () => {
  const user = await requireSession();
  return ok(await getUserPrefs(user));
});

const patchSchema = z.object({
  tourCompleted: z.boolean().optional(),
});

export const PATCH = withErrors(async (req) => {
  const user = await requireSession();
  const body = await parseJson(req, patchSchema);

  const prefs = await updateUserPrefs(user, body);

  return ok(prefs);
});
