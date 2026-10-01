import { z } from "zod";
import { withErrors } from "@repo/server-core/errors/http";
import { requireRole } from "@repo/server-core/authz/require-role";
import { requireCenterActor } from "@repo/server-core/authz/center-actor";
import { ok } from "@repo/server-core/http/envelope";
import { parseJson } from "@repo/server-core/validation/zod";
import { resendTeacherInvite } from "@repo/server-core/services/external-teachers/index";

type Ctx = { params: Promise<{ teacherId: string }> };

const bodySchema = z.object({ locale: z.enum(["ar", "en"]).optional() });

export const POST = withErrors(async (req, ctx) => {
  await requireRole("center_admin");
  const actor = await requireCenterActor();
  const { teacherId } = await (ctx as Ctx).params;
  const { locale } = await parseJson(req, bodySchema);
  const invite = await resendTeacherInvite(actor, teacherId, locale ?? "ar");
  return ok({
    claimLink: invite.link,
    expiresAt: invite.expiresAt,
    delivery: invite.email.status,
  });
});
