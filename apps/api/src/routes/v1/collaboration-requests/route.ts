import { z } from "zod";
import { delegatedWithCenter } from "@repo/server-core/authz/teacher-actor";
import { MANAGER } from "@repo/server-core/authz/center-actor";
import { ok } from "@repo/server-core/http/envelope";
import { parseJson } from "@repo/server-core/validation/zod";
import {
  createCollaborationRequest,
  listCollaborationRequests,
} from "@repo/server-core/services/collaboration/collaboration";

const bodySchema = z
  .object({
    teacherId: z.string().uuid().optional(),
    centerId: z.string().uuid().optional(),
    subjectId: z.string().uuid(),
    gradeLevelId: z.string().uuid(),
    trackId: z.string().uuid().nullish(),
    roomId: z.string().uuid().nullish(),
    daysOfWeek: z.array(z.number().int().min(0).max(6)).min(1).max(7),
    startTime: z.string().regex(/^\d{2}:\d{2}$/),
    endTime: z.string().regex(/^\d{2}:\d{2}$/),
    startDate: z.coerce.date(),
    endDate: z.coerce.date().nullish(),
    expectedStudents: z.number().int().positive().max(10000).nullish(),
    proposedCenterShare: z.number().int().min(0).max(99_999_900).nullish(),
    proposedPricingMethod: z
      .enum(["whole_room_percent", "per_attending_student"])
      .nullish(),
    message: z.string().trim().max(1000).nullish(),
  })
  .strict()
  .refine((b) => !b.endDate || b.endDate >= b.startDate, {
    message: "endDate must be on or after startDate",
    path: ["endDate"],
  })
  .refine((b) => b.endTime > b.startTime, {
    message: "endTime must be after startTime",
    path: ["endTime"],
  });

export const POST = delegatedWithCenter(
  async (req, _ctx, { acting: user }) => {
    const body = await parseJson(req, bodySchema);
    const teacherId = user.role === "teacher" ? user.id : body.teacherId;
    const centerId = user.role === "center_admin" ? (user.centerId as string) : body.centerId;
    if (!teacherId || !centerId) {
      throw new (await import("@repo/server-core/errors/classes")).ValidationError(
        user.role === "teacher" ? "centerId is required" : "teacherId is required",
      );
    }
    return ok(
      await createCollaborationRequest({ ...body, teacherId, centerId }, user),
      { status: 201 },
    );
  },
  { staffAllow: MANAGER },
);

export const GET = delegatedWithCenter(
  async (req, _ctx, { acting: user }) => {
    const status = new URL(req.url).searchParams.get("status") ?? undefined;
    return ok(await listCollaborationRequests(user, status));
  },
  { staffAllow: MANAGER },
);
