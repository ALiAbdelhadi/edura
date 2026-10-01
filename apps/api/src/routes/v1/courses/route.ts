import { getSessionUser } from "@repo/server-core/erp-auth/session";
import { requireRole } from "@repo/server-core/authz/require-role";
import { toActingUser } from "@repo/server-core/authz/teacher-actor";
import { withErrors } from "@repo/server-core/errors/http";
import { runAfter } from "@repo/server-core/http/after";
import { withRateLimit } from "@repo/server-core/rate-limit/middleware";
import { ok } from "@repo/server-core/http/envelope";
import { trackFirstGroup } from "@repo/server-core/services/analytics/funnel";
import { isNotPastDate, moneySchema } from "@repo/server-core/validation/common";
import { parseJson } from "@repo/server-core/validation/zod";
import { toDateKey } from "@repo/server-core/lib/date-key";
import {
  createCourse,
  createTeacherDirectCourse,
} from "@repo/server-core/services/center/courses";
import { listCourses } from "@repo/server-core/services/courses/list-courses";
import { z } from "zod";
import { invalidatesPublicData } from "@repo/server-core/cache/public-data";

type ActingUser = Awaited<ReturnType<typeof toActingUser>>;

const publicGet = withRateLimit(
  withErrors(async (req) => listCoursesResponse(req, null)),
  60,
  60,
);

export const GET = withErrors(async (req, ctx) => {
  const user0 = await getSessionUser();
  if (!user0) return publicGet(req, ctx);
  return listCoursesResponse(req, await toActingUser(user0));
});

async function listCoursesResponse(req: Request, user: ActingUser | null) {
  const url = new URL(req.url);

  const result = await listCourses(user, {
    centerId: url.searchParams.get("centerId"),
    teacherId: url.searchParams.get("teacherId"),
    subject: url.searchParams.get("subject"),
    status: url.searchParams.get("status"),
    deliveryMode: url.searchParams.get("deliveryMode"),
  });

  return ok(result);
}

const schedulePatternSchema = z
  .object({
    daysOfWeek: z.array(z.number().int().min(0).max(6)).min(1),
    startTime: z.string().regex(/^\d{2}:\d{2}$/),
    endTime: z.string().regex(/^\d{2}:\d{2}$/),
    startDate: z.coerce.date(),
    endDate: z.coerce.date(),
  })
  .refine((p) => isNotPastDate(toDateKey(p.startDate)), {
    message: "startDate cannot be in the past",
    path: ["startDate"],
  })
  .refine((p) => p.endDate >= p.startDate, {
    message: "endDate must be on or after startDate",
    path: ["endDate"],
  });

const deliveryShape = {
  deliveryMode: z.enum(["onsite", "online", "hybrid"]).optional(),
  onlineUrl: z.string().trim().url().max(500).nullish(),
};

const createSchema = z.object({
  teacherId: z.string().min(1),
  defaultRoomId: z.string().optional(),
  title: z.string().trim().min(1),
  subject: z.string().trim().min(1),
  description: z.string().optional(),
  gradeTag: z.string().optional(),
  schedulePattern: schedulePatternSchema,
  price: moneySchema,
  pricePerMonth: moneySchema.nullish(),
  pricePerSession: moneySchema.nullish(),
  maxStudents: z.number().int().positive().max(10000),
  pricingMethod: z.enum(["whole_room_percent", "per_attending_student"]).nullish(),
  ...deliveryShape,
});

const teacherDirectSchema = z
  .object({
    title: z.string().trim().min(1),
    subject: z.string().trim().min(1),
    description: z.string().optional(),
    gradeTag: z.string().optional(),
    location: z.string().trim().max(200).optional(),
    schedulePattern: schedulePatternSchema,
    maxStudents: z.number().int().positive().max(10000),
    pricePerMonth: moneySchema.nullish(),
    pricePerSession: moneySchema.nullish(),
    ...deliveryShape,
  })
  .strict();

const handlePost = withErrors(async (req) => {
  const session = await getSessionUser();
  if (session?.role === "teacher") {
    const body = await parseJson(req, teacherDirectSchema);
    const { course, sessionsGenerated } = await createTeacherDirectCourse(session, body);
    runAfter(() => trackFirstGroup(session, { centerId: null, teacherId: course.teacherId }));
    return ok(
      { ...course, course, sessionsGenerated, sessionCount: sessionsGenerated },
      { status: 201 },
    );
  }

  const user = await requireRole("center_admin");
  const body = await parseJson(req, createSchema);
  const { course, sessionsGenerated } = await createCourse(user, body);
  runAfter(() => trackFirstGroup(user, { centerId: course.centerId, teacherId: course.teacherId }));
  return ok(
    {
      ...course,
      course,
      sessionsGenerated,
      sessionCount: sessionsGenerated,
    },
    { status: 201 },
  );
});

export const POST = invalidatesPublicData(handlePost);
