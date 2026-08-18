import type { CenterStaffRole, Prisma } from "@repo/database";
import type { SessionUser } from "../../auth/types";
import { platformDb, scopedDb } from "../../db/scope";
import { lookupStudents } from "../attendance/checkin";

/* ═══════════════════════════════════════════════════════════════════════════
 * GLOBAL SEARCH — one box that finds the RECORD, not just the screen.
 *
 * The ⌘K palette already searched DESTINATIONS ("where is the counter?"). This
 * is the other half of the question an operator actually asks: "where is
 * Mariam?", "which group is 3rd-secondary chemistry?", "who did receipt
 * RCP-NILE-2026-00042 belong to?". Until now every one of those cost a
 * navigation to a list screen and a second search inside it.
 *
 * ── THREE RULES, and they are the whole design ─────────────────────────────
 *
 * 1. IT ADDS NO REACH. Every provider below reads what the caller's own role
 *    ALREADY reads through an existing route, under the same tier constant and
 *    the same tenancy. A global search is the most tempting place in a product
 *    to quietly widen a boundary — one query, no screen to review — so the
 *    boundary is expressed as a TABLE (`CENTER_PROVIDERS`) whose `tier` column
 *    can be diffed against `center-actor.ts`'s capability map by eye.
 *
 * 2. IT OFFERS NOTHING THE ROLE CANNOT OPEN. `design/CONSTITUTION.md` §3:
 *    excluded capabilities are ABSENT, never disabled. So a provider is skipped
 *    when the caller's portal holds no destination for its hits, rather than
 *    returning rows that land on a 403. This is why the center's courses,
 *    teachers and staff providers are OWNER-only: the `staff` portal has no
 *    classes, teachers or staff screen, so a hit there would have nowhere to go.
 *
 * 3. FREE TEXT IS NARROWER THAN AN IDENTIFIER. Two typed characters must never
 *    enumerate the platform. Name-shaped queries are bounded to the caller's own
 *    tenancy; only a thing the reader already HELD — a student code whose check
 *    character agrees, a full phone number, a receipt number — reaches wider.
 *    For students this is not re-implemented: `lookupStudents` already draws
 *    exactly that line, with its own tiered disclosure, and is called as-is.
 *    A second definition of "who may this center see" is the drift this
 *    codebase keeps refusing.
 * ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Every kind a client knows how to label. Additive by design, and SHARED by
 * both apps: `apps/superadmin` implements its own providers (it reads the
 * platform, not a tenant, through its own services) but emits THIS contract, so
 * a result row means the same thing on both sides and neither palette needs a
 * shape of its own.
 *
 * The person kinds are the ROLE, not one flat "user": grouping the back
 * office's directory by role gives headings that are already translated and
 * already meaningful ("Teachers", "Parents") instead of one undifferentiated
 * run of names with an English enum in the subtitle.
 */
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
  /** Stable per (kind, record) — the React key, not a DB id contract. */
  id: string;
  /** The primary line, in the reader's own words. Already masked if it must be. */
  title: string;
  /** One line of context: a grade, a teacher, an amount. May be absent. */
  subtitle?: string;
  /** A short identifier drawn at the trailing edge: student code, receipt no. */
  badge?: string;
  /**
   * Money, in PIASTERS and SIGNED, exactly as the ledger stores it (negative =
   * a refund). Deliberately a NUMBER and not a formatted string: this kernel
   * does not know the reader's numeral system, and money formatted on the
   * server is the one thing in this product that must not be — `formatEGP` is
   * the single implementation, and it runs where the locale is.
   */
  amount?: number;
  /** A destination this role holds. Never a route it would be refused at. */
  href: string;
  /**
   * The title is REDACTED — a student this center does not hold, reached
   * because the reader supplied their code or their number. The UI says so;
   * without the flag it would read as a person with a strange name.
   */
  masked?: boolean;
};

export type SearchGroup = { kind: SearchKind; hits: SearchHit[] };

export type GlobalSearchResult = {
  q: string;
  groups: SearchGroup[];
  /** True when at least one provider hit its cap — "keep typing" is honest. */
  truncated: boolean;
};

/**
 * WHO IS ASKING, already resolved. The kernel does not resolve principals: the
 * app owns `resolveCenterActorContext` / `toActingUser` and their revocation
 * semantics, and re-deriving them here would be a second door onto the same
 * delegation boundary.
 */
export type SearchPrincipal =
  | {
      kind: "center";
      /** Center-shaped actor — `scopedDb` binds RLS to `acting.centerId`. */
      acting: SessionUser;
      /** null = the center owner; otherwise the staff preset tier. */
      staffRole: CenterStaffRole | null;
      portal: "admin" | "staff";
    }
  | { kind: "teacher"; acting: SessionUser; portal: "teacher" | "assistant" }
  | { kind: "student"; user: SessionUser }
  | { kind: "parent"; user: SessionUser };

/** Below this a query is a prefix, and a prefix is how you enumerate. */
export const MIN_QUERY_LENGTH = 2;
/** Per provider. Small on purpose: the palette is a jump, not a report. */
export const PER_KIND = 5;

type Locale = "ar" | "en";
type Ctx = { q: string; locale: Locale };

/* ─────────────────────────────────────────────────────────────────────────
 * Small shared helpers
 * ───────────────────────────────────────────────────────────────────────── */

const contains = (q: string) =>
  ({ contains: q, mode: "insensitive" }) as Prisma.StringFilter;

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

/**
 * Rank within a kind: a title that STARTS with what was typed comes first.
 *
 * Postgres `contains` gives no ordering, so without this a search for "أحمد"
 * puts "محمد أحمد سيد" above "أحمد علي" purely by insertion order — and the
 * reader's own guess about which row they want is almost always the prefix one.
 *
 * EXPORTED so the back office's own providers order identically. Ordering is a
 * thing a reader learns once and then relies on; two palettes in one product
 * that rank differently is a worse defect than either ranking.
 */
export function rankHits(hits: SearchHit[], q: string): SearchHit[] {
  const needle = q.toLowerCase();
  return hits
    .map((hit, i) => {
      const title = hit.title.toLowerCase();
      const badge = (hit.badge ?? "").toLowerCase();
      const score = badge === needle ? 0 : title.startsWith(needle) ? 1 : 2;
      return { hit, score, i };
    })
    .sort((a, b) => a.score - b.score || a.i - b.i)
    .map((x) => x.hit);
}

/* ═══════════════════════════════════════════════════════════════════════════
 * CENTER — the owner's portal and the staff portal.
 *
 * The `tier` on each provider is the tier of the ROUTE that already serves the
 * same data. Read this table beside the CAPABILITY MAP in center-actor.ts:
 * they must agree, and disagreement here is a privilege escalation, not a bug
 * in a list.
 * ═══════════════════════════════════════════════════════════════════════════ */

type CenterTier = "reception" | "manager" | "accountant" | "owner";

/**
 * Does this center principal hold `tier`?
 *
 * The owner holds everything the center holds. A manager inherits the
 * receptionist's tier (superset semantics, exactly as `RECEPTION` encodes it).
 * `center_accountant` is a SIDEWAYS tier, not a rung: it reads money and
 * nothing else, so it must not fall through to `reception`.
 */
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
  // Called as-is, deliberately. It already splits identifier-reach from
  // free-text-reach and tiers the disclosure; re-writing that here is how the
  // two would eventually disagree about what a receptionist may see.
  const rows = await lookupStudents(q, p.acting);

  return rows.slice(0, PER_KIND).map((r) => ({
    kind: "student" as const,
    id: r.studentId,
    // `maskName` returns null for a name it cannot reduce. Falling back to the
    // CODE rather than to an empty row: the reader supplied that code, so it
    // identifies the row for them, and a blank line in a result list reads as
    // a rendering fault rather than as a redaction.
    title: r.name ?? r.studentCode ?? "—",
    masked: !r.onOurRoster,
    // The phone, and — for a child we do not hold — the centre that does, so a
    // masked row is still identifiable to the person reading it. `isShell` is
    // deliberately NOT surfaced: it is an internal account state, its only
    // English token would be untranslated in an Arabic list, and the counter
    // screen this row hands off to states it properly.
    subtitle: join(r.phone, r.onOurRoster ? null : r.otherCenters[0]),
    ...(r.studentCode ? { badge: r.studentCode } : {}),
    // ON OUR ROSTER → their record. NOT ours → the counter, seeded, because
    // that is the only thing this center may legitimately do with a walk-in
    // carrying somebody else's card: serve them, not browse them. `?code=` is
    // the hand-off parameter the check-in screen already reads.
    href: r.onOurRoster
      ? `/dashboard/${p.portal}/students/${r.studentId}`
      : `/dashboard/${p.portal}/checkin?code=${encodeURIComponent(r.studentCode ?? q)}`,
  }));
}

async function centerCourses(
  p: Extract<SearchPrincipal, { kind: "center" }>,
  { q, locale }: Ctx,
): Promise<SearchHit[]> {
  return scopedDb(p.acting, async (tx) => {
    const courses = await tx.course.findMany({
      where: {
        centerId: p.acting.centerId,
        status: "active",
        OR: [{ title: contains(q) }, { subject: contains(q) }],
      },
      select: {
        id: true,
        title: true,
        teacherId: true,
        subjectId: true,
        gradeLevelId: true,
      },
      take: PER_KIND,
    });
    if (!courses.length) return [];

    // Names for the subtitle. Two batched reads for the whole page, never one
    // per row — this runs on every keystroke a receptionist makes.
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
      // The classes screen owns its own search box; seeding it lands the reader
      // on the row rather than on the list.
      href: `/dashboard/admin/classes?q=${encodeURIComponent(c.title)}`,
    }));
  });
}

async function centerTeachers(
  p: Extract<SearchPrincipal, { kind: "center" }>,
  { q }: Ctx,
): Promise<SearchHit[]> {
  const centerId = p.acting.centerId as string;

  return scopedDb(p.acting, async (tx) => {
    const links = await tx.centerTeacherAffiliation.findMany({
      where: { centerId, status: "active", removedAt: null },
      select: { teacherId: true },
    });
    if (!links.length) return [];

    const users = await tx.user.findMany({
      where: {
        id: { in: links.map((l) => l.teacherId) },
        status: { not: "deleted" },
        OR: [{ name: contains(q) }, { phone: { contains: q } }],
      },
      select: { id: true, name: true, phone: true },
      take: PER_KIND,
    });

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
  { q }: Ctx,
): Promise<SearchHit[]> {
  const centerId = p.acting.centerId as string;

  return scopedDb(p.acting, async (tx) => {
    const profiles = await tx.teacherProfile.findMany({
      where: {
        managedByCenterId: centerId,
        systemStatus: "external",
        user: { status: { not: "deleted" }, name: contains(q) },
      },
      select: { userId: true, user: { select: { name: true, phone: true } } },
      take: PER_KIND,
    });

    return profiles.map((t) => ({
      kind: "external_teacher" as const,
      id: t.userId,
      title: t.user.name,
      subtitle: t.user.phone ?? undefined,
      // The one center entity besides a student with a real detail page.
      href: `/dashboard/admin/external-teachers/${t.userId}`,
    }));
  });
}

async function centerRooms(
  p: Extract<SearchPrincipal, { kind: "center" }>,
  { q }: Ctx,
): Promise<SearchHit[]> {
  return scopedDb(p.acting, async (tx) => {
    const rooms = await tx.room.findMany({
      where: {
        centerId: p.acting.centerId,
        isActive: true,
        OR: [{ name: contains(q) }, { description: contains(q) }],
      },
      select: { id: true, name: true, description: true },
      take: PER_KIND,
    });

    return rooms.map((r) => ({
      kind: "room" as const,
      id: r.id,
      title: r.name,
      // The description, when the centre wrote one — NOT the capacity. A bare
      // "30" beside a hall name reads as a fragment rather than as a seat
      // count, and this kernel has no catalogue to label it from.
      subtitle: r.description ?? undefined,
      href: `/dashboard/${p.portal}/rooms`,
    }));
  });
}

async function centerStaffMembers(
  p: Extract<SearchPrincipal, { kind: "center" }>,
  { q }: Ctx,
): Promise<SearchHit[]> {
  const centerId = p.acting.centerId as string;

  return scopedDb(p.acting, async (tx) => {
    const links = await tx.centerStaff.findMany({
      where: { centerId, removedAt: null },
      select: { id: true, staffUserId: true, role: true, title: true },
    });
    if (!links.length) return [];

    const users = await tx.user.findMany({
      where: {
        id: { in: links.map((l) => l.staffUserId) },
        status: { not: "deleted" },
        OR: [{ name: contains(q) }, { email: contains(q) }],
      },
      select: { id: true, name: true, email: true },
      take: PER_KIND,
    });
    const byUser = new Map(links.map((l) => [l.staffUserId, l]));

    return users.map((u) => ({
      kind: "staff" as const,
      id: u.id,
      title: u.name,
      subtitle: join(byUser.get(u.id)?.title, u.email),
      href: `/dashboard/admin/staff`,
    }));
  });
}

/**
 * Receipts, by receipt number.
 *
 * DELIBERATELY IDENTIFIER-ONLY. A payment reached by the payer's name would be
 * a money search keyed on free text — the receptionist tier does not hold this
 * provider at all, and even for the tiers that do, "list this center's payments
 * for anyone called محمد" is a report, and reports have a screen with a date
 * range and an export. A receipt number is a thing the reader is holding.
 */
async function centerPayments(
  p: Extract<SearchPrincipal, { kind: "center" }>,
  { q }: Ctx,
): Promise<SearchHit[]> {
  return scopedDb(p.acting, async (tx) => {
    const payments = await tx.payment.findMany({
      where: {
        centerId: p.acting.centerId,
        receiptNumber: contains(q),
      },
      select: {
        id: true,
        receiptNumber: true,
        amount: true,
        paidAt: true,
        studentId: true,
      },
      orderBy: { paidAt: "desc" },
      take: PER_KIND,
    });
    if (!payments.length) return [];

    const students = await tx.user.findMany({
      where: { id: { in: [...new Set(payments.map((x) => x.studentId))] } },
      select: { id: true, name: true },
    });
    const studentName = new Map(students.map((s) => [s.id, s.name]));

    return payments.map((x) => ({
      kind: "payment" as const,
      id: x.id,
      title: studentName.get(x.studentId) ?? x.receiptNumber,
      // Signed, so a refund reads as a negative amount rather than needing an
      // English `status` token beside it.
      amount: x.amount,
      badge: x.receiptNumber,
      href:
        p.portal === "admin"
          ? `/dashboard/admin/fees`
          : `/dashboard/staff/finance`,
    }));
  });
}

/**
 * THE CENTER BOUNDARY, in one readable table.
 *
 * `portals` is not a duplicate of `tier` — it answers a different question.
 * `tier` is "may this principal READ it"; `portals` is "does the screen this
 * hit links to EXIST in the portal they are standing in". Courses pass the
 * first for a manager and fail the second, because the staff portal has no
 * classes screen; offering the row anyway would teach the arbitrariness
 * constitution §3 forbids.
 */
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

/* ═══════════════════════════════════════════════════════════════════════════
 * TEACHER — and the assistant acting on their behalf.
 *
 * `acting` is ALREADY the teacher (the app resolves it through the Step 8
 * delegation helper), so every query below keys on `acting.id` and an assistant
 * inherits exactly the teacher's reach and nothing wider.
 * ═══════════════════════════════════════════════════════════════════════════ */

async function teacherCourses(
  p: Extract<SearchPrincipal, { kind: "teacher" }>,
  { q }: Ctx,
): Promise<SearchHit[]> {
  return platformDb(async (tx) => {
    const courses = await tx.course.findMany({
      where: {
        teacherId: p.acting.id,
        status: "active",
        OR: [{ title: contains(q) }, { subject: contains(q) }],
      },
      select: { id: true, title: true, startTime: true, endTime: true },
      take: PER_KIND,
    });

    return courses.map((c) => ({
      kind: "course" as const,
      id: c.id,
      title: c.title,
      subtitle: join(c.startTime, c.endTime),
      // The classes screen selects a class from `?courseId=`, so the hit opens
      // the group rather than a list the reader has to find it in again.
      href: `/dashboard/${p.portal}/classes?courseId=${c.id}`,
    }));
  });
}

/**
 * A teacher's students = the people enrolled in the teacher's own courses.
 *
 * NO IDENTIFIER WIDENING HERE, unlike the counter. A teacher has no reason to
 * resolve a child who is not in one of their groups, and the counter's wider
 * reach exists only because a walk-in physically standing at a desk has to be
 * served. Free text and code alike are bounded to the roster of their courses.
 */
async function teacherStudents(
  p: Extract<SearchPrincipal, { kind: "teacher" }>,
  { q }: Ctx,
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
    const profiles = await tx.studentProfile.findMany({
      where: {
        userId: { in: ids },
        OR: [
          { studentCode: q.toUpperCase() },
          { fullName: contains(q) },
          { user: { name: contains(q) } },
        ],
      },
      select: {
        userId: true,
        fullName: true,
        studentCode: true,
        user: { select: { name: true } },
      },
      take: PER_KIND,
    });

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
          // The gradebook is the teacher's per-student screen; it opens on the
          // group this student is in. The teacher portal has no student record
          // page, and inventing a link to one would be a hit that 404s.
          href: courseId
            ? `/dashboard/${p.portal}/grades?courseId=${courseId}`
            : `/dashboard/${p.portal}/grades`,
        };
      });
  });
}

async function teacherCenters(
  p: Extract<SearchPrincipal, { kind: "teacher" }>,
  { q }: Ctx,
): Promise<SearchHit[]> {
  return platformDb(async (tx) => {
    const links = await tx.centerTeacherAffiliation.findMany({
      where: { teacherId: p.acting.id, status: "active", removedAt: null },
      select: { centerId: true },
    });
    if (!links.length) return [];

    const centers = await tx.center.findMany({
      where: { id: { in: links.map((l) => l.centerId) }, name: contains(q) },
      select: { id: true, name: true, area: true },
      take: PER_KIND,
    });

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
    // The assistant portal has no `centers` screen — see rule 3 above.
    ...(p.portal === "teacher"
      ? [{ kind: "center" as const, run: () => teacherCenters(p, ctx) }]
      : []),
  ];
  const results = await Promise.all(providers.map((prov) => prov.run()));
  return providers.map((prov, i) => ({ kind: prov.kind, hits: results[i] ?? [] }));
}

/* ═══════════════════════════════════════════════════════════════════════════
 * PARENT — their own approved children, and nothing else.
 * ═══════════════════════════════════════════════════════════════════════════ */

async function searchParent(
  p: Extract<SearchPrincipal, { kind: "parent" }>,
  { q }: Ctx,
): Promise<SearchGroup[]> {
  const hits = await platformDb(async (tx) => {
    // APPROVED links only. `pending`, `rejected` and `revoked` all fail — the
    // same rule `assertApprovedChild` enforces on every parent money path, and
    // a search that resolved a revoked child would be a way around it.
    const links = await tx.parentStudentLink.findMany({
      where: { parentId: p.user.id, status: "approved" },
      select: { studentId: true },
    });
    if (!links.length) return [];

    const profiles = await tx.studentProfile.findMany({
      where: {
        userId: { in: links.map((l) => l.studentId) },
        OR: [
          { studentCode: q.toUpperCase() },
          { fullName: contains(q) },
          { user: { name: contains(q) } },
        ],
      },
      select: {
        userId: true,
        fullName: true,
        studentCode: true,
        user: { select: { name: true } },
      },
      take: PER_KIND,
    });

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

/* ═══════════════════════════════════════════════════════════════════════════
 * STUDENT — their own groups. Deliberately the smallest surface of the four:
 * a student's portal is already short enough to scan, and widening their search
 * to teachers or centers would be a directory of adults, which is the one thing
 * a platform whose users are mostly minors must not hand out from a search box.
 * ═══════════════════════════════════════════════════════════════════════════ */

async function searchStudent(
  p: Extract<SearchPrincipal, { kind: "student" }>,
  { q }: Ctx,
): Promise<SearchGroup[]> {
  const hits = await platformDb(async (tx) => {
    const enrollments = await tx.enrollment.findMany({
      where: { studentId: p.user.id, status: "active" },
      select: { courseId: true },
    });
    if (!enrollments.length) return [];

    const courses = await tx.course.findMany({
      where: {
        id: { in: enrollments.map((e) => e.courseId) },
        OR: [{ title: contains(q) }, { subject: contains(q) }],
      },
      select: { id: true, title: true, teacherId: true },
      take: PER_KIND,
    });
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

/* ═══════════════════════════════════════════════════════════════════════════
 * The one entry point.
 * ═══════════════════════════════════════════════════════════════════════════ */

export async function globalSearch(
  principal: SearchPrincipal,
  opts: { q: string; locale?: Locale },
): Promise<GlobalSearchResult> {
  const q = opts.q.trim();
  const ctx: Ctx = { q, locale: opts.locale === "en" ? "en" : "ar" };

  // Short-circuits BEFORE any query: a one-character search is not a search,
  // and running seven providers on every keystroke of a word is how a counter
  // screen becomes slow at exactly the moment somebody is waiting at it.
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
