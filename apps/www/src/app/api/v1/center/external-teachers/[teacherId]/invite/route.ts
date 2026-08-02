import { z } from "zod";
import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import { requireCenterActor } from "@/lib/authz/center-actor";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { resendTeacherInvite } from "@/lib/services/external-teachers";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ teacherId: string }> };

const bodySchema = z.object({ locale: z.enum(["ar", "en"]).optional() });

/**
 * Re-send the join invite, and hand back the link.
 *
 * The link is in the response ON PURPOSE: an invite sitting in a spam folder
 * must not strand a teacher who has already agreed to join, and the center can
 * simply show it to them. The service refuses once a password exists, so this
 * can never become a center-controlled password reset on someone else's
 * account — the same rule the assistant and staff invites hold.
 */
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
