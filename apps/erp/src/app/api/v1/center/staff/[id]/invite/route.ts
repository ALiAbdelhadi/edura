import { z } from "zod";
import { withErrors } from "@/lib/errors/http";
import { withRateLimit } from "@/lib/rate-limit/middleware";
import { requireRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { resendStaffInvite } from "@/lib/services/center/staff";

export const dynamic = "force-dynamic";

const bodySchema = z
  .object({ locale: z.enum(["ar", "en"]).optional() })
  .strict();

export const POST = withRateLimit(
  withErrors(async (req, ctx) => {
    const owner = await requireRole("center_admin");
    const { id } = await ctx.params;
    const { locale } = await parseJson(req, bodySchema).catch(() => ({
      locale: undefined as "ar" | "en" | undefined,
    }));
    const invite = await resendStaffInvite(owner, id as string, locale ?? "ar");
    return ok({
      delivery: invite.email.status,
      claimLink: invite.claimLink,
      expiresAt: invite.expiresAt,
    });
  }),
  10,
  10,
);
