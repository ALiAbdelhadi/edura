import { delegated } from "@repo/server-core/authz/teacher-actor";
import { ok } from "@repo/server-core/http/envelope";
import { declineAffiliation } from "@repo/server-core/services/collaboration/affiliation-membership";

export const POST = delegated(async (_req, ctx, { acting: user }) => {
  const { id } = await ctx.params;

  await declineAffiliation(user, id);

  return ok({ declined: true });
});
