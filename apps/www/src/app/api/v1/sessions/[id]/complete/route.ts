import { withErrors } from "@/lib/errors/http";
import { delegatedWithCenter } from "@/lib/authz/teacher-actor";
import { requireRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { completeSession } from "@/lib/services/finance/distribution";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export const POST = delegatedWithCenter(async (_req, ctx, { acting: user }) => {
  const { id } = await ctx.params;
  const result = await completeSession(id, user);
  return ok(result);
});
