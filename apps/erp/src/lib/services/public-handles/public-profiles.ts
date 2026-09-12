import { platformDb, type TenantTx } from "@/lib/db/scope";
import { NotFoundError } from "@/lib/errors/classes";
import type { CourseDeliveryMode } from "@repo/database";
import { findHandleOwner } from "./public-handles";

// What the public sees of a centre or a teacher — the session-less read
// behind GET /api/v1/centers/[id], /p/[handle] and the tenant subdomain.
//
// Two rules, both deliberate:
//  - STATUS GATE. A centre that is not `active`, or a teacher whose user is
//    not `active`, is a 404 here — not an empty page. Pending, suspended,
//    rejected and blacklisted tenants have no public face.
//  - THE MEETING LINK IS NEVER SELECTED. `courses.online_url` is a paid
//    credential (docs/decisions/course-delivery-and-teacher-day.md); the
//    select below is the whole contract, and it is not in it.

const COURSE_SELECT = {
  id: true,
  title: true,
  subject: true,
  gradeTag: true,
  price: true,
  pricePerMonth: true,
  pricePerSession: true,
  maxStudents: true,
  teacherId: true,
  centerId: true,
  deliveryMode: true,
  location: true,
  daysOfWeek: true,
  startTime: true,
  endTime: true,
  startDate: true,
  endDate: true,
} as const;

type CourseRow = {
  id: string;
  title: string;
  subject: string;
  gradeTag: string | null;
  price: number;
  pricePerMonth: number | null;
  pricePerSession: number | null;
  maxStudents: number;
  teacherId: string;
  centerId: string | null;
  deliveryMode: CourseDeliveryMode;
  location: string | null;
  daysOfWeek: number[];
  startTime: string;
  endTime: string;
  startDate: Date;
  endDate: Date | null;
};

export type PublicCourse = {
  id: string;
  title: string;
  subject: string;
  gradeTag: string | null;
  price: number;
  pricePerMonth: number | null;
  pricePerSession: number | null;
  maxStudents: number;
  enrolledCount: number;
  teacherName: string;
  centerName: string | null;
  deliveryMode: CourseDeliveryMode;
  location: string | null;
  schedulePattern: {
    daysOfWeek: number[];
    startTime: string;
    endTime: string;
    startDate: Date;
    endDate: Date | null;
  };
};

async function enrichCourses(tx: TenantTx, courses: CourseRow[]): Promise<PublicCourse[]> {
  const courseIds = courses.map((c) => c.id);
  const teacherIds = [...new Set(courses.map((c) => c.teacherId))];
  const centerIds = [...new Set(courses.map((c) => c.centerId).filter((x): x is string => !!x))];

  const [teachers, centers, enrollmentCounts] = await Promise.all([
    teacherIds.length
      ? tx.user.findMany({ where: { id: { in: teacherIds } }, select: { id: true, name: true } })
      : Promise.resolve([] as { id: string; name: string }[]),
    centerIds.length
      ? tx.center.findMany({ where: { id: { in: centerIds } }, select: { id: true, name: true } })
      : Promise.resolve([] as { id: string; name: string }[]),
    courseIds.length
      ? tx.enrollment.groupBy({
          by: ["courseId"],
          where: { courseId: { in: courseIds }, status: "active" },
          _count: { _all: true },
        })
      : Promise.resolve([] as { courseId: string; _count: { _all: number } }[]),
  ]);

  const teacherMap = new Map(teachers.map((t) => [t.id, t.name]));
  const centerMap = new Map(centers.map((c) => [c.id, c.name]));
  const countMap = new Map(enrollmentCounts.map((e) => [e.courseId, e._count._all]));

  return courses.map((c) => ({
    id: c.id,
    title: c.title,
    subject: c.subject,
    gradeTag: c.gradeTag,
    price: c.price,
    pricePerMonth: c.pricePerMonth,
    pricePerSession: c.pricePerSession,
    maxStudents: c.maxStudents,
    enrolledCount: countMap.get(c.id) ?? 0,
    teacherName: teacherMap.get(c.teacherId) ?? "",
    centerName: c.centerId ? (centerMap.get(c.centerId) ?? null) : null,
    deliveryMode: c.deliveryMode,
    location: c.location,
    schedulePattern: {
      daysOfWeek: c.daysOfWeek,
      startTime: c.startTime,
      endTime: c.endTime,
      startDate: c.startDate,
      endDate: c.endDate,
    },
  }));
}

export type CenterPublicProfile = {
  kind: "center";
  id: string;
  handle: string | null;
  name: string;
  shortId: string;
  description: string | null;
  subjects: string[];
  address: string | null;
  area: string | null;
  governorate: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  logoUrl: string | null;
  rating: number;
  reviewCount: number;
  courses: PublicCourse[];
  totalCourses: number;
  totalStudents: number;
};

export async function getCenterPublicProfile(centerId: string): Promise<CenterPublicProfile> {
  return platformDb(async (tx) => {
    const center = await tx.center.findFirst({
      where: { id: centerId, status: "active" },
      include: { publicHandle: { select: { handle: true } } },
    });
    if (!center) throw new NotFoundError("Center not found");

    const rows = await tx.course.findMany({
      where: { centerId, status: "active" },
      select: COURSE_SELECT,
      orderBy: [{ subject: "asc" }, { title: "asc" }],
    });
    const [courses, reviewStats] = await Promise.all([
      enrichCourses(tx, rows),
      tx.review.aggregate({
        where: { centerId },
        _avg: { rating: true },
        _count: { _all: true },
      }),
    ]);

    const avgRating = reviewStats._avg.rating;
    return {
      kind: "center",
      id: center.id,
      handle: center.publicHandle?.handle ?? null,
      name: center.name,
      shortId: center.shortId,
      description: center.description,
      subjects: center.subjects,
      address: center.address,
      area: center.area,
      governorate: center.governorate,
      phone: center.phone,
      whatsapp: center.whatsapp,
      email: center.email,
      logoUrl: center.logoUrl,
      rating: avgRating ? Math.round(avgRating * 10) / 10 : 0,
      reviewCount: reviewStats._count._all,
      courses,
      totalCourses: courses.length,
      totalStudents: courses.reduce((sum, c) => sum + c.enrolledCount, 0),
    };
  });
}

export type TeacherPublicProfile = {
  kind: "teacher";
  id: string;
  handle: string | null;
  name: string;
  bio: string;
  subjects: string[];
  qualifications: string;
  experienceYears: number;
  photoUrl: string | null;
  ratingAvg: number;
  ratingCount: number;
  courses: PublicCourse[];
  totalCourses: number;
  totalStudents: number;
};

export async function getTeacherPublicPage(teacherUserId: string): Promise<TeacherPublicProfile> {
  return platformDb(async (tx) => {
    const teacher = await tx.user.findFirst({
      where: { id: teacherUserId, role: "teacher", status: "active" },
      select: {
        id: true,
        name: true,
        teacherProfile: {
          include: { publicHandle: { select: { handle: true } } },
        },
      },
    });
    if (!teacher) throw new NotFoundError("Teacher not found");
    const profile = teacher.teacherProfile;

    const rows = await tx.course.findMany({
      where: { teacherId: teacherUserId, status: "active" },
      select: COURSE_SELECT,
      orderBy: [{ subject: "asc" }, { title: "asc" }],
    });
    const courses = await enrichCourses(tx, rows);

    return {
      kind: "teacher",
      id: teacher.id,
      handle: profile?.publicHandle?.handle ?? null,
      name: teacher.name,
      bio: profile?.bio ?? "",
      subjects: profile?.subjects ?? [],
      qualifications: profile?.qualifications ?? "",
      experienceYears: profile?.experienceYears ?? 0,
      photoUrl: profile?.photoUrl ?? null,
      ratingAvg: profile?.ratingAvg ?? 0,
      ratingCount: profile?.ratingCount ?? 0,
      courses,
      totalCourses: courses.length,
      totalStudents: courses.reduce((sum, c) => sum + c.enrolledCount, 0),
    };
  });
}

export type PublicProfile = CenterPublicProfile | TeacherPublicProfile;

// `/p/<handle>` and `<handle>.<root>` both end here. Null covers every way a
// page can be missing — unknown handle, or an owner the status gate hides —
// so the caller renders one 404 and leaks nothing about which it was.
export async function resolvePublicProfile(handle: string): Promise<PublicProfile | null> {
  const owner = await findHandleOwner(handle);
  if (!owner) return null;
  try {
    return owner.kind === "center"
      ? await getCenterPublicProfile(owner.centerId)
      : await getTeacherPublicPage(owner.teacherUserId);
  } catch (err) {
    if (err instanceof NotFoundError) return null;
    throw err;
  }
}
