import { delegated } from "@repo/server-core/authz/teacher-actor";
import { ok } from "@repo/server-core/http/envelope";
import { leaveAffiliation } from "@repo/server-core/services/collaboration/affiliation-membership";

type Ctx = { params: Promise<{ id: string }> };

export const DELETE = delegated(async (_req, ctx, { acting: user }) => {
  const { id } = await ctx.params;

  const result = await leaveAffiliation(user, id);

  return ok(result);
});
