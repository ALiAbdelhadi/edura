import { z } from "zod";
import { runAfter } from "@repo/server-core/http/after";
import { delegatedWithCenter } from "@repo/server-core/authz/teacher-actor";
import { MANAGER } from "@repo/server-core/authz/center-actor";
import { ok } from "@repo/server-core/http/envelope";
import { trackFirstTeacher } from "@repo/server-core/services/analytics/funnel";
import { acceptCollaborationRequest } from "@repo/server-core/services/collaboration/collaboration";
import { parseJson } from "@repo/server-core/validation/zod";
import { invalidatesPublicData } from "@repo/server-core/cache/public-data";

const acceptSchema = z
  .object({
    pricingMethod: z.enum(["whole_room_percent", "per_attending_student"]).nullish(),
  })
  .nullish();

const handlePost = delegatedWithCenter(
  async (req, ctx, { acting: user }) => {
    const { id } = await ctx.params;
    const body = req.body ? await parseJson(req, acceptSchema) : null;
    const result = await acceptCollaborationRequest(id, user, {
      pricingMethod: body?.pricingMethod,
    });
    runAfter(() => trackFirstTeacher(user, result.request?.centerId));
    return ok(result);
  },
  { staffAllow: MANAGER },
);

export const POST = invalidatesPublicData(handlePost);
