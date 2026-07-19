import { withErrors } from "@/lib/errors/http";
import { delegatedWithCenter } from "@/lib/authz/teacher-actor";
import { requireRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { cancelCollaborationRequest } from "@/lib/services/collaboration/collaboration";

export const dynamic = "force-dynamic";

export const POST = delegatedWithCenter(async (_req, ctx, { acting: user }) => {
  const { id } = await ctx.params;
  return ok(await cancelCollaborationRequest(id, user));
});
