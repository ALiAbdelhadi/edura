import { delegatedWithCenter } from "@repo/server-core/authz/teacher-actor";
import { ok } from "@repo/server-core/http/envelope";
import { previewSessionSettlement } from "@repo/server-core/services/finance/distribution";

export const GET = delegatedWithCenter(
  async (_req, ctx, { acting: user }) => {
    const { id } = await ctx.params;
    return ok(await previewSessionSettlement(id, user));
  },
  { staffAllow: ["receptionist", "manager"] },
);
