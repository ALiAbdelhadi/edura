import { withErrors } from "@/lib/errors/http";
import { runAfter } from "@/lib/http/after";
import { ok } from "@/lib/http/envelope";
import { captureServerEvent } from "@/lib/observability/posthog-server";
import { withRateLimit } from "@/lib/rate-limit/middleware";
import { registerTeacher } from "@/lib/services/auth/register";
import {
  emailSchema,
  localeSchema,
  nameSchema,
  passwordSchema,
  phoneSchema,
} from "@/lib/validation/common";
import { parseJson } from "@/lib/validation/zod";
import { ANALYTICS_EVENTS } from "@repo/observability";
import { z } from "zod";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  name: nameSchema,
  phone: phoneSchema.optional(),
  locale: localeSchema,
});

export const POST = withRateLimit(
  withErrors(async (req) => {
    const input = await parseJson(req, bodySchema);
    const result = await registerTeacher(input);
    runAfter(() =>
      captureServerEvent(
        { id: result.user.id, role: "teacher" },
        ANALYTICS_EVENTS.SIGNUP_COMPLETED,
        { signup_role: "teacher", locale: input.locale },
      ),
    );
    return ok(result, { status: 201 });
  }),
  10,
  10,
);
