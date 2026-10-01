import { z } from "zod";
import { withErrors } from "@repo/server-core/errors/http";
import { requireRole } from "@repo/server-core/authz/require-role";
import { ok } from "@repo/server-core/http/envelope";
import { parseJson } from "@repo/server-core/validation/zod";
import { chooseRosterCenter } from "@repo/server-core/services/me/roster-choice";

const bodySchema = z.object({ centerId: z.string().uuid() }).strict();

export const POST = withErrors(async (req) => {
  const user = await requireRole("student");
  const { centerId } = await parseJson(req, bodySchema);

  const result = await chooseRosterCenter(user, centerId);
  return ok(result);
});
