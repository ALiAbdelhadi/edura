import { delegatedWithCenter } from "@repo/server-core/authz/teacher-actor";
import { MANAGER } from "@repo/server-core/authz/center-actor";
import { ok } from "@repo/server-core/http/envelope";
import { cancelCollaborationRequest } from "@repo/server-core/services/collaboration/collaboration";

export const POST = delegatedWithCenter(
  async (_req, ctx, { acting: user }) => {
    const { id } = await ctx.params;
    return ok(await cancelCollaborationRequest(id, user));
  },
  { staffAllow: MANAGER },
);
