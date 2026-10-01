import { withErrors } from "@repo/server-core/errors/http";
import { runAfter } from "@repo/server-core/http/after";
import { ok } from "@repo/server-core/http/envelope";
import { captureServerEvent } from "@repo/server-core/services/analytics/posthog-server";
import { withRateLimit } from "@repo/server-core/rate-limit/middleware";
import { registerTeacher } from "@repo/server-core/services/auth/register";
import {
  emailSchema,
  localeSchema,
  nameSchema,
  passwordSchema,
  phoneSchema,
} from "@repo/server-core/validation/common";
import { parseJson } from "@repo/server-core/validation/zod";
import { ANALYTICS_EVENTS } from "@repo/observability";
import { z } from "zod";

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
