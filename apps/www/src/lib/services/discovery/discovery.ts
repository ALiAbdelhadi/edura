import { platformDb } from "@/lib/db/scope";
import type { Prisma } from "@repo/database";

const TIME_BUCKETS: Record<string, { start: string; end: string }> = {
  morning: { start: "06:00", end: "12:00" },
  afternoon: { start: "12:00", end: "17:00" },
  evening: { start: "17:00", end: "23:00" },
};

const EARTH_RADIUS_KM = 6371;

function boundingBox(lat: number, lng: number, distanceKm: number) {
  const latDelta = distanceKm / 111.32;
  const cos = Math.cos((lat * Math.PI) / 180) || 1e-6;
  const lngDelta = distanceKm / (111.32 * Math.abs(cos));
  return {
    latMin: lat - latDelta,
    latMax: lat + latDelta,
    lngMin: lng - lngDelta,
    lngMax: lng + lngDelta,
  };
}

type CourseSearchInput = {
  subject?: string;
  subjectId?: string;
  priceMin?: string;
  priceMax?: string;
  daysOfWeek?: string;
  timeBucket?: string;
  distanceKm?: string;
  nearLat?: string;
  nearLng?: string;
  minRating?: string;
  q?: string;
  page?: string;
  limit?: string;
};

export type StudentCatalogScope = {
  gradeLevelId: string;
  trackId: string | null;
};

export async function searchCourses(
  filters: CourseSearchInput,
  studentScope?: StudentCatalogScope | null,
) {
  const page = Math.max(1, parseInt(filters.page ?? "1", 10) || 1);
  const limit = Math.min(
    100,
    Math.max(1, parseInt(filters.limit ?? "20", 10) || 20),
  );

  return platformDb(async (tx) => {
    const where: Prisma.CourseWhereInput = { status: "active" };

    if (studentScope) {
      where.AND = [
        { gradeLevelId: studentScope.gradeLevelId },
        {
          OR: [
            { trackId: null },
            ...(studentScope.trackId
              ? [{ trackId: studentScope.trackId }]
              : []),
          ],
        },
      ];
    }

    if (filters.subject) where.subject = filters.subject;
    if (filters.subjectId) {
      where.subjectId = filters.subjectId === "none" ? null : filters.subjectId;
    }

    const price: Prisma.IntFilter = {};
    if (filters.priceMin) price.gte = parseInt(filters.priceMin, 10);
    if (filters.priceMax) price.lte = parseInt(filters.priceMax, 10);
    if (price.gte !== undefined || price.lte !== undefined) where.price = price;

    if (filters.daysOfWeek) {
      const days = filters.daysOfWeek
        .split(",")
        .map((d) => parseInt(d, 10))
        .filter(Number.isFinite);
      if (days.length > 0) where.daysOfWeek = { hasEvery: days };
    }

    if (filters.timeBucket) {
      const bucket = TIME_BUCKETS[filters.timeBucket];
      if (bucket) where.startTime = { gte: bucket.start, lt: bucket.end };
    }

    if (filters.q) {
      where.OR = [
        { title: { contains: filters.q, mode: "insensitive" } },
        { subject: { contains: filters.q, mode: "insensitive" } },
        { description: { contains: filters.q, mode: "insensitive" } },
      ];
    }

    const centerFilter: Prisma.CenterWhereInput = { status: "active" };
    const hasGeoFilter = !!(filters.nearLat && filters.nearLng && filters.distanceKm);
    if (hasGeoFilter) {
      const box = boundingBox(
        parseFloat(filters.nearLat as string),
        parseFloat(filters.nearLng as string),
        parseFloat(filters.distanceKm as string),
      );
      centerFilter.lat = { gte: box.latMin, lte: box.latMax };
      centerFilter.lng = { gte: box.lngMin, lte: box.lngMax };
    }
    // Teacher-direct courses (centerId NULL) have no center to be "active" —
    // a bare relation filter would silently drop them. Include them unless a
    // geo filter is applied (they have no coordinates to match).
    const centerArm: Prisma.CourseWhereInput = hasGeoFilter
      ? { center: { is: centerFilter } }
      : { OR: [{ centerId: null }, { center: { is: centerFilter } }] };
    where.AND = [...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []), centerArm];

    if (filters.minRating) {
      const minR = parseFloat(filters.minRating);
      const eligible = await tx.teacherProfile.findMany({
        where: { ratingAvg: { gte: minR } },
        select: { userId: true },
      });
      where.teacherId = { in: eligible.map((t) => t.userId) };
    }

    const courses = await tx.course.findMany({
      where,
      select: {
        id: true,
        centerId: true,
        teacherId: true,
        title: true,
        subject: true,
        subjectId: true,
        subjectRef: { select: { nameAr: true, nameEn: true } },
        description: true,
        gradeTag: true,
        daysOfWeek: true,
        startTime: true,
        endTime: true,
        startDate: true,
        endDate: true,
        price: true,
        pricePerMonth: true,
        pricePerSession: true,
        location: true,
        maxStudents: true,
        status: true,
        center: {
          select: {
            id: true,
            name: true,
            shortId: true,
            area: true,
            address: true,
            logoUrl: true,
          },
        },
      },
      skip: (page - 1) * limit,
      take: limit,
    });

    if (courses.length === 0) return { courses: [], page, limit };

    const teacherIds = [...new Set(courses.map((c) => c.teacherId))];
    const [profiles, teacherUsers] = await Promise.all([
      tx.teacherProfile.findMany({
        where: { userId: { in: teacherIds } },
        select: { userId: true, ratingAvg: true },
      }),
      tx.user.findMany({
        where: { id: { in: teacherIds } },
        select: { id: true, name: true },
      }),
    ]);
    const ratingByTeacher = new Map(
      profiles.map((p) => [p.userId, p.ratingAvg]),
    );
    const nameByTeacher = new Map(teacherUsers.map((u) => [u.id, u.name]));

    const courseIds = courses.map((c) => c.id);

    // Upcoming sessions (for the per-session pass picker on the student UI).
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const upcoming = await tx.session.findMany({
      where: { courseId: { in: courseIds }, status: "scheduled", date: { gte: today } },
      orderBy: { date: "asc" },
      select: { id: true, courseId: true, date: true, startTime: true, endTime: true },
      take: 400,
    });
    const upcomingByCourse = new Map<string, typeof upcoming>();
    for (const s of upcoming) {
      const list = upcomingByCourse.get(s.courseId) ?? [];
      if (list.length < 8) list.push(s);
      upcomingByCourse.set(s.courseId, list);
    }

    const grouped = await tx.enrollment.groupBy({
      by: ["courseId"],
      where: { courseId: { in: courseIds }, status: "active" },
      _count: { _all: true },
    });
    const countByCourse = new Map(
      grouped.map((g) => [g.courseId, g._count._all]),
    );

    const enriched = courses.map((c) => {
      const activeEnrollmentCount = countByCourse.get(c.id) ?? 0;
      return {
        ...c,
        teacherName: nameByTeacher.get(c.teacherId) ?? null,
        teacherRatingAvg: ratingByTeacher.get(c.teacherId) ?? 0,
        activeEnrollmentCount,
        remainingSeats: c.maxStudents - activeEnrollmentCount,
        upcomingSessions: upcomingByCourse.get(c.id) ?? [],
      };
    });

    return { courses: enriched, page, limit };
  });
}

type CenterSearchInput = {
  subject?: string;
  distanceKm?: string;
  nearLat?: string;
  nearLng?: string;
  q?: string;
  page?: string;
  limit?: string;
};

export async function searchCenters(filters: CenterSearchInput) {
  const page = Math.max(1, parseInt(filters.page ?? "1", 10) || 1);
  const limit = Math.min(
    100,
    Math.max(1, parseInt(filters.limit ?? "20", 10) || 20),
  );

  return platformDb(async (tx) => {
    const where: Prisma.CenterWhereInput = {
      status: "active",
      courses: { some: { status: "active" } },
    };

    if (filters.subject) where.subjects = { has: filters.subject };

    if (filters.nearLat && filters.nearLng && filters.distanceKm) {
      const box = boundingBox(
        parseFloat(filters.nearLat),
        parseFloat(filters.nearLng),
        parseFloat(filters.distanceKm),
      );
      where.lat = { gte: box.latMin, lte: box.latMax };
      where.lng = { gte: box.lngMin, lte: box.lngMax };
    }

    if (filters.q) {
      where.OR = [
        { name: { contains: filters.q, mode: "insensitive" } },
        { description: { contains: filters.q, mode: "insensitive" } },
      ];
    }

    const centers = await tx.center.findMany({
      where,
      select: {
        id: true,
        name: true,
        shortId: true,
        description: true,
        address: true,
        area: true,
        subjects: true,
        lat: true,
        lng: true,
        phone: true,
        whatsapp: true,
        logoUrl: true,
      },
      skip: (page - 1) * limit,
      take: limit,
    });

    return { centers, page, limit };
  });
}

type TeacherSearchInput = {
  subject?: string;
  minRating?: string;
  q?: string;
  page?: string;
  limit?: string;
};

export async function searchTeachers(filters: TeacherSearchInput) {
  const page = Math.max(1, parseInt(filters.page ?? "1", 10) || 1);
  const limit = Math.min(
    100,
    Math.max(1, parseInt(filters.limit ?? "20", 10) || 20),
  );

  return platformDb(async (tx) => {
    const userFilter: Prisma.UserWhereInput = {
      status: "active",
      role: "teacher",
    };
    if (filters.q)
      userFilter.name = { contains: filters.q, mode: "insensitive" };

    const where: Prisma.TeacherProfileWhereInput = { user: userFilter };
    if (filters.subject) where.subjects = { has: filters.subject };
    if (filters.minRating)
      where.ratingAvg = { gte: parseFloat(filters.minRating) };

    const rows = await tx.teacherProfile.findMany({
      where,
      include: { user: { select: { name: true } } },
      skip: (page - 1) * limit,
      take: limit,
    });

    const teachers = rows.map((p) => ({
      userId: p.userId,
      name: p.user.name,
      bio: p.bio,
      subjects: p.subjects,
      qualifications: p.qualifications,
      experienceYears: p.experienceYears,
      photoUrl: p.photoUrl,
      ratingAvg: p.ratingAvg,
      ratingCount: p.ratingCount,
    }));

    return { teachers, page, limit };
  });
}
