import { z } from "zod";
import { withErrors } from "@repo/server-core/errors/http";
import { requireRole } from "@repo/server-core/authz/require-role";
import { ok } from "@repo/server-core/http/envelope";
import { parseJson } from "@repo/server-core/validation/zod";
import { broadcastCenterNotification } from "@repo/server-core/services/notifications/broadcast";

const broadcastSchema = z.object({
  scope: z.enum(["center", "course"]),
  courseId: z.string().optional(),
  title: z.string().min(1),
  body: z.string().min(1),
});

export const POST = withErrors(async (req) => {
  const user = await requireRole("center_admin");
  const data = await parseJson(req, broadcastSchema);

  if (data.scope === "course" && !data.courseId) {
    throw new Error("courseId is required when scope is 'course'");
  }

  const sent = await broadcastCenterNotification(user, data);

  return ok({ sent });
});
