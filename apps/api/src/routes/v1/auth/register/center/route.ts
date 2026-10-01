import { withErrors } from "@repo/server-core/errors/http";
import { runAfter } from "@repo/server-core/http/after";
import { ok } from "@repo/server-core/http/envelope";
import { captureServerEvent } from "@repo/server-core/services/analytics/posthog-server";
import { withRateLimit } from "@repo/server-core/rate-limit/middleware";
import { registerCenter } from "@repo/server-core/services/auth/register";
import {
  loadRegisteredCenterAdmin,
  setCenterLocation,
} from "@repo/server-core/services/auth/register-center";
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

const pointSchema = z.object({
  type: z.literal("Point"),
  coordinates: z.tuple([z.number(), z.number()]),
});

const bodySchema = z.object({
  centerName: z.string().trim().min(1),
  adminName: nameSchema,
  email: emailSchema,
  password: passwordSchema,
  phone: phoneSchema.optional(),
  address: z.string().optional(),
  description: z.string().optional(),
  subjects: z.array(z.string()).optional(),
  whatsapp: phoneSchema.optional(),
  centerEmail: emailSchema.optional(),
  locale: localeSchema,
  location: pointSchema.optional(),
});

export const POST = withRateLimit(
  withErrors(async (req) => {
    const input = await parseJson(req, bodySchema);

    const { userId, centerId, shortId } = await registerCenter({
      admin: {
        email: input.email,
        password: input.password,
        name: input.adminName,
        locale: input.locale,
      },
      center: {
        name: input.centerName,
        description: input.description,
        subjects: input.subjects,
        address: input.address,
        phone: input.phone,
        whatsapp: input.whatsapp,
        email: input.centerEmail,
      },
    });

    if (input.location) {
      const [lng, lat] = input.location.coordinates;
      await setCenterLocation(centerId, { lat, lng });
    }

    const user = await loadRegisteredCenterAdmin(userId);

    runAfter(() =>
      captureServerEvent(
        { id: userId, role: "center_admin", centerId },
        ANALYTICS_EVENTS.SIGNUP_COMPLETED,
        { signup_role: "center_admin", locale: input.locale },
      ),
    );

    return ok(
      {
        user: {
          id: userId,
          email: user?.email ?? input.email,
          role: user?.role ?? "center_admin",
          status: user?.status ?? "active",
          name: user?.name ?? input.adminName,
        },
        center: { id: centerId, shortId },
      },
      { status: 201 },
    );
  }),
  10,
  10,
);
