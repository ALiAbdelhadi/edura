import { z } from "zod";
import { withErrors } from "@repo/server-core/errors/http";
import { withRateLimit } from "@repo/server-core/rate-limit/middleware";
import { requireRole } from "@repo/server-core/authz/require-role";
import { ok } from "@repo/server-core/http/envelope";
import { parseJson } from "@repo/server-core/validation/zod";
import { resendAssistantInvite } from "@repo/server-core/services/teacher/assistants";

const bodySchema = z
  .object({ locale: z.enum(["ar", "en"]).optional() })
  .strict();

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
