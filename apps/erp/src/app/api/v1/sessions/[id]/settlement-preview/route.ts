import { delegatedWithCenter } from "@/lib/authz/teacher-actor";
import { ok } from "@/lib/http/envelope";
import { previewSessionSettlement } from "@/lib/services/finance/distribution";

export const dynamic = "force-dynamic";

export const GET = delegatedWithCenter(
  async (_req, ctx, { acting: user }) => {
    const { id } = await ctx.params;
    return ok(await previewSessionSettlement(id, user));
  },
  { staffAllow: ["receptionist", "manager"] },
);
