import { z } from "zod";
import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import { requireCenterScope } from "@/lib/authz/require-center-scope";
import { scopedDb } from "@/lib/db/scope";
import { NotFoundError, BusinessRuleError } from "@/lib/errors/classes";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";

export const dynamic = "force-dynamic";

const rejectSchema = z.object({
  note: z.string().optional(),
});

export const POST = withErrors(async (req: Request, ctx: { params: Promise<Record<string, string>> }) => {
  const user = await requireRole("center_admin");
  const body = await parseJson(req, rejectSchema);
  const { id } = await ctx.params;

  const request = await scopedDb(user, async (tx) => {
    const existing = await tx.deletionRequest.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError("Deletion request not found");
    requireCenterScope(user, existing.centerId);
    if (existing.status !== "pending") {
      throw new BusinessRuleError(`Request already ${existing.status}`);
    }

    return tx.deletionRequest.update({
      where: { id },
      data: {
        status: "rejected",
        reviewedBy: user.id,
        reviewedAt: new Date(),
        ...(body.note ? { reviewNote: body.note } : {}),
      },
    });
  });

  return ok(request);
});
