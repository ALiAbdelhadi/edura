import { platformDb } from "@/lib/db/scope";
import { exactQuery } from "@repo/database/search-text";
import type { Prisma } from "@repo/database";
import { parsePageLimit } from "@/lib/validation/common";

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
  deliveryMode?: string;
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

export function parseDays(raw: string) {
  return raw
    .split(",")
    .map((d) => parseInt(d, 10))
    .filter((d) => Number.isFinite(d) && d >= 0 && d <= 6);
}

// A student asking for "online" means "somewhere I can attend online", which a
// hybrid group satisfies; the same is true of "onsite". Only "hybrid" is
// literal — it means a group that genuinely offers both.
export function applyDeliveryFilter(
  where: Prisma.CourseWhereInput,
  mode: string | undefined,
) {
  if (!mode || mode === "any") return;
  if (mode === "online") where.deliveryMode = { in: ["online", "hybrid"] };
  else if (mode === "onsite") where.deliveryMode = { in: ["onsite", "hybrid"] };
  else if (mode === "hybrid") where.deliveryMode = "hybrid";
}

function studentScopeArms(scope: StudentCatalogScope): Prisma.CourseWhereInput[] {
  return [
    { gradeLevelId: scope.gradeLevelId },
    {
      OR: [
        { trackId: null },
        ...(scope.trackId ? [{ trackId: scope.trackId }] : []),
      ],
    },
  ];
}

export async function searchCourses(
  filters: CourseSearchInput,
  studentScope?: StudentCatalogScope | null,
) {
  const { page, limit } = parsePageLimit(filters, 20);

  return platformDb(async (tx) => {
    const where: Prisma.CourseWhereInput = { status: "active" };

    if (studentScope) where.AND = studentScopeArms(studentScope);

    if (filters.subject) where.subject = filters.subject;
    if (filters.subjectId) {
      where.subjectId = filters.subjectId === "none" ? null : filters.subjectId;
    }

    const price: Prisma.IntFilter = {};
    if (filters.priceMin) price.gte = parseInt(filters.priceMin, 10);
    if (filters.priceMax) price.lte = parseInt(filters.priceMax, 10);
    if (price.gte !== undefined || price.lte !== undefined) where.price = price;

    if (filters.daysOfWeek) {
      // ANY of the chosen days, not all of them: a student asking for Wednesday
      // and Thursday wants what runs on either, which is what the day picker
      // means. `hasEvery` would answer "runs on both", and had no caller.
      const days = parseDays(filters.daysOfWeek);
      if (days.length > 0) where.daysOfWeek = { hasSome: days };
    }

    applyDeliveryFilter(where, filters.deliveryMode);

    if (filters.timeBucket) {
      const bucket = TIME_BUCKETS[filters.timeBucket];
      if (bucket) where.startTime = { gte: bucket.start, lt: bucket.end };
    }

    if (filters.q) {
      where.AND = [
        ...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []),
        ...exactQuery(filters.q, (t) => ({ searchText: { contains: t } })),
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
        deliveryMode: true,
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
  includeEmpty?: boolean;
};

export async function searchCenters(filters: CenterSearchInput) {
  const { page, limit } = parsePageLimit(filters, 20);

  return platformDb(async (tx) => {
    const where: Prisma.CenterWhereInput = {
      status: "active",
      ...(filters.includeEmpty ? {} : { courses: { some: { status: "active" } } }),
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
      where.AND = exactQuery(filters.q, (t) => ({ searchText: { contains: t } }));
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
      orderBy: { name: "asc" },
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
  const { page, limit } = parsePageLimit(filters, 20);

  return platformDb(async (tx) => {
    const userFilter: Prisma.UserWhereInput = {
      status: "active",
      role: "teacher",
    };
    if (filters.q)
      userFilter.AND = exactQuery(filters.q, (t) => ({ searchText: { contains: t } }));

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

type TeacherDaySearchInput = {
  daysOfWeek?: string;
  subject?: string;
  subjectId?: string;
  deliveryMode?: string;
  timeBucket?: string;
  minRating?: string;
  q?: string;
  page?: string;
  limit?: string;
};

// "Who teaches on Wednesday?" — the same active-course rows the course search
// reads, pivoted onto the teacher. It adds NO reach: a course that would not
// appear in searchCourses for this student cannot appear here either, because
// the two build their WHERE from the same arms.
export async function searchTeachersByDay(
  filters: TeacherDaySearchInput,
  studentScope?: StudentCatalogScope | null,
) {
  const { page, limit } = parsePageLimit(filters, 20);
  const days = filters.daysOfWeek ? parseDays(filters.daysOfWeek) : [];

  return platformDb(async (tx) => {
    const where: Prisma.CourseWhereInput = { status: "active" };
    const and: Prisma.CourseWhereInput[] = studentScope ? studentScopeArms(studentScope) : [];

    if (days.length > 0) where.daysOfWeek = { hasSome: days };
    if (filters.subject) where.subject = filters.subject;
    if (filters.subjectId) {
      where.subjectId = filters.subjectId === "none" ? null : filters.subjectId;
    }
    applyDeliveryFilter(where, filters.deliveryMode);

    if (filters.timeBucket) {
      const bucket = TIME_BUCKETS[filters.timeBucket];
      if (bucket) where.startTime = { gte: bucket.start, lt: bucket.end };
    }

    // An online course has no centre to be closed, so the centre arm mirrors
    // searchCourses: a teacher-direct course (centerId NULL) always qualifies.
    and.push({ OR: [{ centerId: null }, { center: { is: { status: "active" } } }] });
    where.AND = and;

    const teacherRows = await tx.course.groupBy({
      by: ["teacherId"],
      where,
      _count: { _all: true },
    });
    if (teacherRows.length === 0) return { teachers: [], page, limit, total: 0 };

    const allTeacherIds = teacherRows.map((r) => r.teacherId);
    const [profiles, users] = await Promise.all([
      tx.teacherProfile.findMany({
        where: { userId: { in: allTeacherIds } },
        select: {
          userId: true,
          ratingAvg: true,
          ratingCount: true,
          photoUrl: true,
          subjects: true,
          experienceYears: true,
        },
      }),
      tx.user.findMany({
        where: {
          id: { in: allTeacherIds },
          status: { in: ["active", "shell"] },
          ...(filters.q
            ? { AND: exactQuery(filters.q, (t) => ({ searchText: { contains: t } })) }
            : {}),
        },
        select: { id: true, name: true },
      }),
    ]);
    const profileByTeacher = new Map(profiles.map((p) => [p.userId, p]));
    const nameByTeacher = new Map(users.map((u) => [u.id, u.name]));

    const minRating = filters.minRating ? parseFloat(filters.minRating) : null;
    const ranked = allTeacherIds
      // A suspended or deleted teacher has no user row here and must not be
      // offered, even though their courses are still rows in the table.
      .filter((id) => nameByTeacher.has(id))
      .filter((id) =>
        minRating === null ? true : (profileByTeacher.get(id)?.ratingAvg ?? 0) >= minRating,
      )
      .sort((a, b) => {
        const ra = profileByTeacher.get(a)?.ratingAvg ?? 0;
        const rb = profileByTeacher.get(b)?.ratingAvg ?? 0;
        if (rb !== ra) return rb - ra;
        return (nameByTeacher.get(a) ?? "").localeCompare(nameByTeacher.get(b) ?? "");
      });

    const total = ranked.length;
    const pageIds = ranked.slice((page - 1) * limit, page * limit);
    if (pageIds.length === 0) return { teachers: [], page, limit, total };

    const courses = await tx.course.findMany({
      where: { AND: [where, { teacherId: { in: pageIds } }] },
      select: {
        id: true,
        centerId: true,
        teacherId: true,
        title: true,
        subject: true,
        subjectId: true,
        subjectRef: { select: { nameAr: true, nameEn: true } },
        gradeTag: true,
        daysOfWeek: true,
        startTime: true,
        endTime: true,
        price: true,
        pricePerMonth: true,
        pricePerSession: true,
        location: true,
        deliveryMode: true,
        maxStudents: true,
        center: { select: { id: true, name: true, area: true, logoUrl: true } },
      },
      orderBy: { startTime: "asc" },
    });

    const courseIds = courses.map((c) => c.id);
    const grouped = await tx.enrollment.groupBy({
      by: ["courseId"],
      where: { courseId: { in: courseIds }, status: "active" },
      _count: { _all: true },
    });
    const countByCourse = new Map(grouped.map((g) => [g.courseId, g._count._all]));

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

    const byTeacher = new Map<string, typeof courses>();
    for (const c of courses) {
      const list = byTeacher.get(c.teacherId) ?? [];
      list.push(c);
      byTeacher.set(c.teacherId, list);
    }

    const teachers = pageIds.map((id) => {
      const profile = profileByTeacher.get(id);
      const own = byTeacher.get(id) ?? [];
      return {
        userId: id,
        name: nameByTeacher.get(id) ?? "",
        photoUrl: profile?.photoUrl ?? null,
        ratingAvg: profile?.ratingAvg ?? 0,
        ratingCount: profile?.ratingCount ?? 0,
        experienceYears: profile?.experienceYears ?? null,
        subjects: profile?.subjects ?? [],
        courseCount: own.length,
        courses: own.map((c) => {
          const activeEnrollmentCount = countByCourse.get(c.id) ?? 0;
          return {
            ...c,
            // Which of the days the student asked for this group actually runs on,
            // so the card can say "Wednesday" rather than repeating the whole week.
            matchedDays: days.length > 0 ? c.daysOfWeek.filter((d) => days.includes(d)) : c.daysOfWeek,
            activeEnrollmentCount,
            remainingSeats: c.maxStudents - activeEnrollmentCount,
            upcomingSessions: upcomingByCourse.get(c.id) ?? [],
          };
        }),
      };
    });

    return { teachers, page, limit, total };
  });
}
