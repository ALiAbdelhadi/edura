import { z } from "zod";
import { runAfter } from "@/lib/http/after";
import { delegatedWithCenter } from "@/lib/authz/teacher-actor";
import { MANAGER } from "@/lib/authz/center-actor";
import { ok } from "@/lib/http/envelope";
import { trackFirstTeacher } from "@/lib/observability/funnel";
import { acceptCollaborationRequest } from "@/lib/services/collaboration/collaboration";
import { parseJson } from "@/lib/validation/zod";
import { invalidatesPublicData } from "@/lib/cache/public-data";

export const dynamic = "force-dynamic";

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
