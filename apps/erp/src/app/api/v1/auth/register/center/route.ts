import { platformDb } from "@/lib/db/scope";
import { withErrors } from "@/lib/errors/http";
import { runAfter } from "@/lib/http/after";
import { ok } from "@/lib/http/envelope";
import { captureServerEvent } from "@/lib/observability/posthog-server";
import { withRateLimit } from "@/lib/rate-limit/middleware";
import { registerCenter } from "@/lib/services/auth/register";
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
      await platformDb((tx) => tx.center.update({ where: { id: centerId }, data: { lat, lng } }));
    }

    const user = await platformDb((tx) =>
      tx.user.findUnique({
        where: { id: userId },
        select: { email: true, role: true, status: true, name: true },
      }),
    );

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
