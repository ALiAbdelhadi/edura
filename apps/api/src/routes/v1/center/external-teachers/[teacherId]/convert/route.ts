import { z } from "zod";
import { withErrors } from "@repo/server-core/errors/http";
import { requireRole } from "@repo/server-core/authz/require-role";
import { requireCenterActor } from "@repo/server-core/authz/center-actor";
import { ok } from "@repo/server-core/http/envelope";
import { parseJson } from "@repo/server-core/validation/zod";
import { convertToEnrolled, convertToExternal } from "@repo/server-core/services/external-teachers/index";
import { invalidatesPublicData } from "@repo/server-core/cache/public-data";

type Ctx = { params: Promise<{ teacherId: string }> };

const bodySchema = z.discriminatedUnion("to", [
  z.object({
    to: z.literal("enrolled"),
    email: z.email().nullish(),
    reason: z.string().trim().min(3).max(500),
    locale: z.enum(["ar", "en"]).optional(),
  }),
  z.object({
    to: z.literal("external"),
    reason: z.string().trim().min(3).max(500),
  }),
]);

const handlePost = withErrors(async (req, ctx) => {
  await requireRole("center_admin");
  const actor = await requireCenterActor();
  const { teacherId } = await (ctx as Ctx).params;
  const body = await parseJson(req, bodySchema);

  if (body.to === "enrolled") {
    return ok(
      await convertToEnrolled(actor, teacherId, {
        email: body.email ?? null,
        reason: body.reason,
        locale: body.locale,
      }),
    );
  }
  return ok(await convertToExternal(actor, teacherId, { reason: body.reason }));
});

export const POST = invalidatesPublicData(handlePost);
