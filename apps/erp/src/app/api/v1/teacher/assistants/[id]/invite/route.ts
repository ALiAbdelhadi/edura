import { z } from "zod";
import { withErrors } from "@/lib/errors/http";
import { withRateLimit } from "@/lib/rate-limit/middleware";
import { requireRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { resendAssistantInvite } from "@/lib/services/teacher/assistants";

export const dynamic = "force-dynamic";

const bodySchema = z
  .object({ locale: z.enum(["ar", "en"]).optional() })
  .strict();

/**
 * Re-send an assistant's claim link. Ownership is enforced in the service (the
 * link must belong to THIS teacher), and a re-send mints a fresh token that
 * invalidates the previous one, so an old link stops working the moment a new
 * one is issued. Refused outright once the assistant has set a password.
 */
export const POST = withRateLimit(
  withErrors(async (req, ctx) => {
    const teacher = await requireRole("teacher");
    const { id } = await ctx.params;
    const { locale } = await parseJson(req, bodySchema).catch(() => ({
      locale: undefined as "ar" | "en" | undefined,
    }));
    const invite = await resendAssistantInvite(teacher, id as string, locale ?? "ar");
    return ok({
      delivery: invite.email.status,
      claimLink: invite.claimLink,
      expiresAt: invite.expiresAt,
    });
  }),
  10,
  10,
);
