import { delegated } from "@/lib/authz/teacher-actor";
import { scopedDb } from "@/lib/db/scope";
import { BusinessRuleError, ForbiddenError, NotFoundError } from "@/lib/errors/classes";
import { ok } from "@/lib/http/envelope";

export const dynamic = "force-dynamic";

export const POST = delegated(async (_req, ctx, { acting: user }) => {
  const { id } = await ctx.params;

  await scopedDb(user, async (tx) => {
    const affiliation = await tx.centerTeacherAffiliation.findUnique({ where: { id } });
    if (!affiliation) throw new NotFoundError("Affiliation not found");
    if (affiliation.teacherId !== user.id) throw new ForbiddenError();
    if (affiliation.status !== "pending") {
      throw new BusinessRuleError(`Affiliation is already ${affiliation.status}`);
    }

    await tx.centerTeacherAffiliation.update({
      where: { id },
      data: { status: "declined", respondedAt: new Date() },
    });
  });

  return ok({ declined: true });
});
