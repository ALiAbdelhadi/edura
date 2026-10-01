import { delegated } from "@repo/server-core/authz/teacher-actor";
import { ok } from "@repo/server-core/http/envelope";
import { acceptAffiliation } from "@repo/server-core/services/collaboration/affiliation-membership";

type Ctx = { params: Promise<{ id: string }> };

export const POST = delegated(async (_req, ctx, { acting: user }) => {
  const { id } = await ctx.params;

  const updated = await acceptAffiliation(user, id);

  return ok({ accepted: true, ...updated });
});
