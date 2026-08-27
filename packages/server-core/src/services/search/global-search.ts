import type { CenterStaffRole, Prisma } from "@repo/database";
import {
  exactQuery,
  literalFragments,
  narrowFragments,
  matchesSearchTerms,
  normalizeIdentifier,
  normalizeSearchText,
  searchTerms,
  SEARCH_SCAN_LIMIT,
} from "@repo/database/search-text";
import type { SessionUser } from "../../auth/types";
import { platformDb, scopedDb } from "../../db/scope";
import { lookupStudents } from "../attendance/checkin";

export type SearchKind =
  | "student"
  | "child"
  | "teacher"
  | "external_teacher"
  | "parent"
  | "assistant"
  | "center_admin"
  | "back_office"
  | "course"
  | "room"
  | "staff"
  | "payment"
  | "payment_intent"
  | "center";

export type SearchHit = {
  kind: SearchKind;
  id: string;
  title: string;
  subtitle?: string;
  badge?: string;
  amount?: number;
  href: string;
  masked?: boolean;
};

export type SearchGroup = { kind: SearchKind; hits: SearchHit[] };

export type GlobalSearchResult = {
  q: string;
  groups: SearchGroup[];
  truncated: boolean;
};

export type SearchPrincipal =
  | {
      kind: "center";
      acting: SessionUser;
      staffRole: CenterStaffRole | null;
      portal: "admin" | "staff";
    }
  | { kind: "teacher"; acting: SessionUser; portal: "teacher" | "assistant" }
  | { kind: "student"; user: SessionUser }
  | { kind: "parent"; user: SessionUser };

export const MIN_QUERY_LENGTH = 2;
export const PER_KIND = 5;

type Locale = "ar" | "en";
type Ctx = {
  q: string;
  locale: Locale;
  terms: string[];
  frags: string[];
};

const contains = (q: string) =>
  ({ contains: q, mode: "insensitive" }) as Prisma.StringFilter;

const narrow = narrowFragments;

function catalogName(
  row: { nameAr: string; nameEn: string | null } | null | undefined,
  locale: Locale,
): string | null {
  if (!row) return null;
  return (locale === "en" ? row.nameEn || row.nameAr : row.nameAr) || null;
}

function join(...parts: (string | null | undefined)[]): string | undefined {
  const kept = parts.filter((p): p is string => Boolean(p && p.trim()));
  return kept.length ? kept.join(" · ") : undefined;
}

export function rankHits(hits: SearchHit[], q: string): SearchHit[] {
  const needle = normalizeSearchText(q);
  const identifier = normalizeIdentifier(q);
  return hits
    .map((hit, i) => {
      const title = normalizeSearchText(hit.title);
      const badge = normalizeIdentifier(hit.badge ?? "");
      const score =
        identifier && badge === identifier ? 0 : title.startsWith(needle) ? 1 : 2;
      return { hit, score, i };
    })
    .sort((a, b) => a.score - b.score || a.i - b.i)
    .map((x) => x.hit);
}

type CenterTier = "reception" | "manager" | "accountant" | "owner";

function centerHolds(staffRole: CenterStaffRole | null, tier: CenterTier): boolean {
  if (staffRole === null) return true; // the center owner
  switch (staffRole) {
    case "manager":
      return tier === "reception" || tier === "manager";
    case "receptionist":
      return tier === "reception";
    case "center_accountant":
      return tier === "accountant";
    default:
      return false; // a new sub-role reaches nothing until it is named here
  }
}

async function centerStudents(
  p: Extract<SearchPrincipal, { kind: "center" }>,
  { q }: Ctx,
): Promise<SearchHit[]> {
  const rows = await lookupStudents(q, p.acting);

  return rows.slice(0, PER_KIND).map((r) => ({
    kind: "student" as const,
    id: r.studentId,
    title: r.name ?? r.studentCode ?? "—",
    masked: !r.onOurRoster,
    subtitle: join(r.phone, r.onOurRoster ? null : r.otherCenters[0]),
    ...(r.studentCode ? { badge: r.studentCode } : {}),
    href: r.onOurRoster
      ? `/dashboard/${p.portal}/students/${r.studentId}`
      : `/dashboard/${p.portal}/checkin?code=${encodeURIComponent(r.studentCode ?? q)}`,
  }));
}

async function centerCourses(
  p: Extract<SearchPrincipal, { kind: "center" }>,
  { locale, terms, frags }: Ctx,
): Promise<SearchHit[]> {
  return scopedDb(p.acting, async (tx) => {
    const candidates = await tx.course.findMany({
      where: {
        centerId: p.acting.centerId,
        status: "active",
        AND: narrow(frags, (f) => [{ title: contains(f) }, { subject: contains(f) }]),
      },
      select: {
        id: true,
        title: true,
        subject: true,
        teacherId: true,
        subjectId: true,
        gradeLevelId: true,
      },
      take: SEARCH_SCAN_LIMIT,
    });
    const courses = candidates
      .filter((c) => matchesSearchTerms([c.title, c.subject], terms))
      .slice(0, PER_KIND);
    if (!courses.length) return [];

    const [teachers, subjects, grades] = await Promise.all([
      tx.user.findMany({
        where: { id: { in: [...new Set(courses.map((c) => c.teacherId))] } },
        select: { id: true, name: true },
      }),
      tx.subject.findMany({
        where: {
          id: {
            in: courses.map((c) => c.subjectId).filter((v): v is string => !!v),
          },
        },
        select: { id: true, nameAr: true, nameEn: true },
      }),
      tx.gradeLevel.findMany({
        where: {
          id: {
            in: courses
              .map((c) => c.gradeLevelId)
              .filter((v): v is string => !!v),
          },
        },
        select: { id: true, nameAr: true, nameEn: true },
      }),
    ]);
    const teacherName = new Map(teachers.map((t) => [t.id, t.name]));
    const subjectName = new Map(subjects.map((s) => [s.id, s]));
    const gradeName = new Map(grades.map((g) => [g.id, g]));

    return courses.map((c) => ({
      kind: "course" as const,
      id: c.id,
      title: c.title,
      subtitle: join(
        c.teacherId ? teacherName.get(c.teacherId) : null,
        catalogName(c.subjectId ? subjectName.get(c.subjectId) : null, locale),
        catalogName(c.gradeLevelId ? gradeName.get(c.gradeLevelId) : null, locale),
      ),
      href: `/dashboard/admin/classes?q=${encodeURIComponent(c.title)}`,
    }));
  });
}

async function centerTeachers(
  p: Extract<SearchPrincipal, { kind: "center" }>,
  { terms, frags }: Ctx,
): Promise<SearchHit[]> {
  const centerId = p.acting.centerId as string;

  return scopedDb(p.acting, async (tx) => {
    const links = await tx.centerTeacherAffiliation.findMany({
      where: { centerId, status: "active", removedAt: null },
      select: { teacherId: true },
    });
    if (!links.length) return [];

    const candidates = await tx.user.findMany({
      where: {
        id: { in: links.map((l) => l.teacherId) },
        status: { not: "deleted" },
        AND: narrow(frags, (f) => [{ name: contains(f) }, { phone: contains(f) }]),
      },
      select: { id: true, name: true, phone: true },
      take: SEARCH_SCAN_LIMIT,
    });
    const users = candidates
      .filter((u) => matchesSearchTerms([u.name, u.phone], terms))
      .slice(0, PER_KIND);

    return users.map((u) => ({
      kind: "teacher" as const,
      id: u.id,
      title: u.name,
      subtitle: u.phone ?? undefined,
      href: `/dashboard/admin/teachers`,
    }));
  });
}

async function centerExternalTeachers(
  p: Extract<SearchPrincipal, { kind: "center" }>,
  { terms, frags }: Ctx,
): Promise<SearchHit[]> {
  const centerId = p.acting.centerId as string;

  return scopedDb(p.acting, async (tx) => {
    const candidates = await tx.teacherProfile.findMany({
      where: {
        managedByCenterId: centerId,
        systemStatus: "external",
        user: {
          status: { not: "deleted" },
          AND: narrow(frags, (f) => [{ name: contains(f) }, { phone: contains(f) }]),
        },
      },
      select: { userId: true, user: { select: { name: true, phone: true } } },
      take: SEARCH_SCAN_LIMIT,
    });
    const profiles = candidates
      .filter((t) => matchesSearchTerms([t.user.name, t.user.phone], terms))
      .slice(0, PER_KIND);

    return profiles.map((t) => ({
      kind: "external_teacher" as const,
      id: t.userId,
      title: t.user.name,
      subtitle: t.user.phone ?? undefined,
      href: `/dashboard/admin/external-teachers/${t.userId}`,
    }));
  });
}

async function centerRooms(
  p: Extract<SearchPrincipal, { kind: "center" }>,
  ctx: Ctx,
): Promise<SearchHit[]> {
  const { terms } = ctx;
  return scopedDb(p.acting, async (tx) => {
    const candidates = await tx.room.findMany({
      where: {
        centerId: p.acting.centerId,
        isActive: true,
        AND: exactQuery(ctx.q, (t) => ({ searchText: { contains: t } })),
      },
      select: { id: true, name: true, description: true },
      take: SEARCH_SCAN_LIMIT,
    });
    const rooms = candidates
      .filter((r) => matchesSearchTerms([r.name, r.description], terms))
      .slice(0, PER_KIND);

    return rooms.map((r) => ({
      kind: "room" as const,
      id: r.id,
      title: r.name,
      subtitle: r.description ?? undefined,
      href: `/dashboard/${p.portal}/rooms`,
    }));
  });
}

async function centerStaffMembers(
  p: Extract<SearchPrincipal, { kind: "center" }>,
  { terms, frags }: Ctx,
): Promise<SearchHit[]> {
  const centerId = p.acting.centerId as string;

  return scopedDb(p.acting, async (tx) => {
    const links = await tx.centerStaff.findMany({
      where: { centerId, removedAt: null },
      select: { id: true, staffUserId: true, role: true, title: true },
    });
    if (!links.length) return [];

    const candidates = await tx.user.findMany({
      where: {
        id: { in: links.map((l) => l.staffUserId) },
        status: { not: "deleted" },
        AND: narrow(frags, (f) => [{ name: contains(f) }, { email: contains(f) }]),
      },
      select: { id: true, name: true, email: true },
      take: SEARCH_SCAN_LIMIT,
    });
    const byUser = new Map(links.map((l) => [l.staffUserId, l]));
    const users = candidates
      .filter((u) =>
        matchesSearchTerms([u.name, u.email, byUser.get(u.id)?.title], terms),
      )
      .slice(0, PER_KIND);

    return users.map((u) => ({
      kind: "staff" as const,
      id: u.id,
      title: u.name,
      subtitle: join(byUser.get(u.id)?.title, u.email),
      href: `/dashboard/admin/staff`,
    }));
  });
}

async function centerPayments(
  p: Extract<SearchPrincipal, { kind: "center" }>,
  { q, terms, frags }: Ctx,
): Promise<SearchHit[]> {
  const identifier = normalizeIdentifier(q);

  return scopedDb(p.acting, async (tx) => {
    const select = {
      id: true,
      receiptNumber: true,
      amount: true,
      paidAt: true,
      studentId: true,
    } as const;
    const scope = { centerId: p.acting.centerId };

    let candidates = await tx.payment.findMany({
      where: { ...scope, AND: narrow(frags, (f) => [{ receiptNumber: contains(f) }]) },
      select,
      orderBy: { paidAt: "desc" },
      take: SEARCH_SCAN_LIMIT,
    });

    if (!candidates.length && frags.length) {
      candidates = await tx.payment.findMany({
        where: scope,
        select,
        orderBy: { paidAt: "desc" },
        take: SEARCH_SCAN_LIMIT,
      });
    }

    const payments = candidates
      .filter(
        (x) =>
          matchesSearchTerms([x.receiptNumber], terms) ||
          (identifier.length >= MIN_QUERY_LENGTH &&
            normalizeIdentifier(x.receiptNumber).includes(identifier)),
      )
      .slice(0, PER_KIND);
    if (!payments.length) return [];

    const students = await tx.user.findMany({
      where: {
        id: { in: [...new Set(payments.map((x) => x.studentId).filter(Boolean) as string[])] },
      },
      select: { id: true, name: true },
    });
    const studentName = new Map(students.map((s) => [s.id, s.name]));

    return payments.map((x) => ({
      kind: "payment" as const,
      id: x.id,
      title: (x.studentId ? studentName.get(x.studentId) : null) ?? x.receiptNumber,
      amount: x.amount,
      badge: x.receiptNumber,
      href:
        p.portal === "admin"
          ? `/dashboard/admin/fees`
          : `/dashboard/staff/finance`,
    }));
  });
}

const CENTER_PROVIDERS: {
  kind: SearchKind;
  tier: CenterTier;
  portals: readonly ("admin" | "staff")[];
  run: (
    p: Extract<SearchPrincipal, { kind: "center" }>,
    ctx: Ctx,
  ) => Promise<SearchHit[]>;
}[] = [
  { kind: "student", tier: "reception", portals: ["admin", "staff"], run: centerStudents },
  { kind: "course", tier: "owner", portals: ["admin"], run: centerCourses },
  { kind: "teacher", tier: "owner", portals: ["admin"], run: centerTeachers },
  { kind: "external_teacher", tier: "owner", portals: ["admin"], run: centerExternalTeachers },
  { kind: "room", tier: "manager", portals: ["admin", "staff"], run: centerRooms },
  { kind: "staff", tier: "owner", portals: ["admin"], run: centerStaffMembers },
  { kind: "payment", tier: "accountant", portals: ["admin", "staff"], run: centerPayments },
];

async function searchCenter(
  p: Extract<SearchPrincipal, { kind: "center" }>,
  ctx: Ctx,
): Promise<SearchGroup[]> {
  const runnable = CENTER_PROVIDERS.filter(
    (prov) => centerHolds(p.staffRole, prov.tier) && prov.portals.includes(p.portal),
  );
  const results = await Promise.all(runnable.map((prov) => prov.run(p, ctx)));
  return runnable.map((prov, i) => ({
    kind: prov.kind,
    hits: results[i] ?? [],
  }));
}

async function teacherCourses(
  p: Extract<SearchPrincipal, { kind: "teacher" }>,
  { terms, frags }: Ctx,
): Promise<SearchHit[]> {
  return platformDb(async (tx) => {
    const candidates = await tx.course.findMany({
      where: {
        teacherId: p.acting.id,
        status: "active",
        AND: narrow(frags, (f) => [{ title: contains(f) }, { subject: contains(f) }]),
      },
      select: {
        id: true,
        title: true,
        subject: true,
        startTime: true,
        endTime: true,
      },
      take: SEARCH_SCAN_LIMIT,
    });
    const courses = candidates
      .filter((c) => matchesSearchTerms([c.title, c.subject], terms))
      .slice(0, PER_KIND);

    return courses.map((c) => ({
      kind: "course" as const,
      id: c.id,
      title: c.title,
      subtitle: join(c.startTime, c.endTime),
      href: `/dashboard/${p.portal}/classes?courseId=${c.id}`,
    }));
  });
}

async function teacherStudents(
  p: Extract<SearchPrincipal, { kind: "teacher" }>,
  { q, terms, frags }: Ctx,
): Promise<SearchHit[]> {
  return platformDb(async (tx) => {
    const courses = await tx.course.findMany({
      where: { teacherId: p.acting.id, status: "active" },
      select: { id: true, title: true },
    });
    if (!courses.length) return [];

    const enrollments = await tx.enrollment.findMany({
      where: { courseId: { in: courses.map((c) => c.id) }, status: "active" },
      select: { studentId: true, courseId: true },
    });
    if (!enrollments.length) return [];

    const ids = [...new Set(enrollments.map((e) => e.studentId))];
    const code = normalizeIdentifier(q);
    const candidates = await tx.studentProfile.findMany({
      where: {
        userId: { in: ids },
        OR: [
          ...(code.length >= MIN_QUERY_LENGTH ? [{ studentCode: code }] : []),
          {
            AND: narrow(frags, (f) => [
              { fullName: contains(f) },
              { user: { name: contains(f) } },
            ]),
          },
        ],
      },
      select: {
        userId: true,
        fullName: true,
        studentCode: true,
        user: { select: { name: true } },
      },
      take: SEARCH_SCAN_LIMIT,
    });
    const profiles = candidates
      .filter(
        (s) =>
          s.studentCode === code ||
          matchesSearchTerms([s.user?.name, s.fullName], terms),
      )
      .slice(0, PER_KIND);

    const courseTitle = new Map(courses.map((c) => [c.id, c.title]));
    const firstCourse = new Map<string, string>();
    for (const e of enrollments) {
      if (!firstCourse.has(e.studentId)) firstCourse.set(e.studentId, e.courseId);
    }

    return profiles
      .filter((s): s is typeof s & { userId: string } => Boolean(s.userId))
      .map((s) => {
        const courseId = firstCourse.get(s.userId);
        return {
          kind: "student" as const,
          id: s.userId,
          title: s.user?.name ?? s.fullName,
          subtitle: courseId ? courseTitle.get(courseId) : undefined,
          badge: s.studentCode,
          href: courseId
            ? `/dashboard/${p.portal}/grades?courseId=${courseId}`
            : `/dashboard/${p.portal}/grades`,
        };
      });
  });
}

async function teacherCenters(
  p: Extract<SearchPrincipal, { kind: "teacher" }>,
  { terms, frags }: Ctx,
): Promise<SearchHit[]> {
  return platformDb(async (tx) => {
    const links = await tx.centerTeacherAffiliation.findMany({
      where: { teacherId: p.acting.id, status: "active", removedAt: null },
      select: { centerId: true },
    });
    if (!links.length) return [];

    const candidates = await tx.center.findMany({
      where: {
        id: { in: links.map((l) => l.centerId) },
        AND: narrow(frags, (f) => [{ name: contains(f) }, { area: contains(f) }]),
      },
      select: { id: true, name: true, area: true },
      take: SEARCH_SCAN_LIMIT,
    });
    const centers = candidates
      .filter((c) => matchesSearchTerms([c.name, c.area], terms))
      .slice(0, PER_KIND);

    return centers.map((c) => ({
      kind: "center" as const,
      id: c.id,
      title: c.name,
      subtitle: c.area ?? undefined,
      href: `/dashboard/teacher/centers`,
    }));
  });
}

async function searchTeacher(
  p: Extract<SearchPrincipal, { kind: "teacher" }>,
  ctx: Ctx,
): Promise<SearchGroup[]> {
  const providers: { kind: SearchKind; run: () => Promise<SearchHit[]> }[] = [
    { kind: "student", run: () => teacherStudents(p, ctx) },
    { kind: "course", run: () => teacherCourses(p, ctx) },
    ...(p.portal === "teacher"
      ? [{ kind: "center" as const, run: () => teacherCenters(p, ctx) }]
      : []),
  ];
  const results = await Promise.all(providers.map((prov) => prov.run()));
  return providers.map((prov, i) => ({ kind: prov.kind, hits: results[i] ?? [] }));
}

async function searchParent(
  p: Extract<SearchPrincipal, { kind: "parent" }>,
  { q, terms, frags }: Ctx,
): Promise<SearchGroup[]> {
  const hits = await platformDb(async (tx) => {
    const links = await tx.parentStudentLink.findMany({
      where: { parentId: p.user.id, status: "approved" },
      select: { studentId: true },
    });
    if (!links.length) return [];

    const code = normalizeIdentifier(q);
    const candidates = await tx.studentProfile.findMany({
      where: {
        userId: { in: links.map((l) => l.studentId) },
        OR: [
          ...(code.length >= MIN_QUERY_LENGTH ? [{ studentCode: code }] : []),
          {
            AND: narrow(frags, (f) => [
              { fullName: contains(f) },
              { user: { name: contains(f) } },
            ]),
          },
        ],
      },
      select: {
        userId: true,
        fullName: true,
        studentCode: true,
        user: { select: { name: true } },
      },
      take: SEARCH_SCAN_LIMIT,
    });
    const profiles = candidates
      .filter(
        (s) =>
          s.studentCode === code ||
          matchesSearchTerms([s.user?.name, s.fullName], terms),
      )
      .slice(0, PER_KIND);

    return profiles
      .filter((s): s is typeof s & { userId: string } => Boolean(s.userId))
      .map((s) => ({
        kind: "child" as const,
        id: s.userId,
        title: s.user?.name ?? s.fullName,
        badge: s.studentCode,
        href: `/dashboard/parent/children/${s.userId}`,
      }));
  });

  return [{ kind: "child", hits }];
}

async function searchStudent(
  p: Extract<SearchPrincipal, { kind: "student" }>,
  { terms, frags }: Ctx,
): Promise<SearchGroup[]> {
  const hits = await platformDb(async (tx) => {
    const enrollments = await tx.enrollment.findMany({
      where: { studentId: p.user.id, status: "active" },
      select: { courseId: true },
    });
    if (!enrollments.length) return [];

    const candidates = await tx.course.findMany({
      where: {
        id: { in: enrollments.map((e) => e.courseId) },
        AND: narrow(frags, (f) => [{ title: contains(f) }, { subject: contains(f) }]),
      },
      select: { id: true, title: true, subject: true, teacherId: true },
      take: SEARCH_SCAN_LIMIT,
    });
    const courses = candidates
      .filter((c) => matchesSearchTerms([c.title, c.subject], terms))
      .slice(0, PER_KIND);
    if (!courses.length) return [];

    const teachers = await tx.user.findMany({
      where: { id: { in: [...new Set(courses.map((c) => c.teacherId))] } },
      select: { id: true, name: true },
    });
    const teacherName = new Map(teachers.map((t) => [t.id, t.name]));

    return courses.map((c) => ({
      kind: "course" as const,
      id: c.id,
      title: c.title,
      subtitle: teacherName.get(c.teacherId),
      href: `/dashboard/student/subjects`,
    }));
  });

  return [{ kind: "course", hits }];
}

export async function globalSearch(
  principal: SearchPrincipal,
  opts: { q: string; locale?: Locale },
): Promise<GlobalSearchResult> {
  const q = opts.q.trim();
  const ctx: Ctx = {
    q,
    locale: opts.locale === "en" ? "en" : "ar",
    terms: searchTerms(q),
    frags: literalFragments(q),
  };

  if (q.length < MIN_QUERY_LENGTH) {
    return { q, groups: [], truncated: false };
  }

  let groups: SearchGroup[];
  switch (principal.kind) {
    case "center":
      groups = await searchCenter(principal, ctx);
      break;
    case "teacher":
      groups = await searchTeacher(principal, ctx);
      break;
    case "parent":
      groups = await searchParent(principal, ctx);
      break;
    case "student":
      groups = await searchStudent(principal, ctx);
      break;
  }

  const nonEmpty = groups
    .filter((g) => g.hits.length > 0)
    .map((g) => ({ kind: g.kind, hits: rankHits(g.hits, q) }));

  return {
    q,
    groups: nonEmpty,
    truncated: nonEmpty.some((g) => g.hits.length >= PER_KIND),
  };
}
