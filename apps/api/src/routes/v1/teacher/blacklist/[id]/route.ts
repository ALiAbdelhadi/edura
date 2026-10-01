import { z } from "zod";
import { withErrors } from "@repo/server-core/errors/http";
import { delegated } from "@repo/server-core/authz/teacher-actor";
import { requireRole } from "@repo/server-core/authz/require-role";
import { ok } from "@repo/server-core/http/envelope";
import { parseJson } from "@repo/server-core/validation/zod";
import { removeBlacklistEntry } from "@repo/server-core/services/blacklist/blacklist";

type Ctx = { params: Promise<{ id: string }> };

const bodySchema = z.object({ reason: z.string().trim().min(1).max(500) });

export const DELETE = delegated(async (req, ctx, { acting: user }) => {
  const { id } = await ctx.params;
  const { reason } = await parseJson(req, bodySchema);
  return ok(await removeBlacklistEntry(id, user, reason));
});
