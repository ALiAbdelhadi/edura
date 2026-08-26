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
type Ctx = {
  q: string;
  locale: Locale;
  /** The query as words, normalized. The JS matcher's input. */
  terms: string[];
  /** The byte-comparable pieces of those words. The SQL pre-filter's input. */
  frags: string[];
};

/* ─────────────────────────────────────────────────────────────────────────
 * Small shared helpers
 * ───────────────────────────────────────────────────────────────────────── */

const contains = (q: string) =>
  ({ contains: q, mode: "insensitive" }) as Prisma.StringFilter;

/**
 * THE TWO-STAGE MATCH — the shape every provider below now has, and the reason
 * this file changed at all.
 *
 * A search for «احمد» used to be `name ILIKE '%احمد%'`, which returned NOTHING
 * against three rows stored «أحمد» (measured on dev, 2026-08-19). ILIKE folds
 * ASCII case and nothing else; the hamza an Egyptian typist omits, the ة they
 * write as ه and the family name they put first are all invisible to it.
 *
 * The fix cannot be "normalize the query", because the database holds the RAW
 * text — so it is done in two stages that answer two different questions:
 *
 *   NARROW (here, in SQL) — `literalFragments` yields the pieces of the query
 *     that survive normalization unchanged, so they can be compared byte-wise.
 *     «احمد» narrows to «حمد», which also matches «محمد»; that is fine, because
 *     narrowing is all it claims to do. It can never EXCLUDE a row the full
 *     query would have accepted, which is the only property it must have.
 *
 *   DECIDE (in JS, `matchesSearchTerms`) — the normalized comparison, over the
 *     row's own searchable fields. This is what actually answers the question,
 *     and it is the same function the palette's destination matcher runs, so
 *     one box cannot disagree with the other.
 *
 * The cost is a wider `take` (`SEARCH_SCAN_LIMIT` instead of `PER_KIND`) so the
 * loose stage cannot fill the page with near-misses and push the real answer
 * off the end. Every provider here is already bounded to ONE center, ONE
 * teacher's courses or ONE parent's children before that cap applies.
 */
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
  // Normalized on BOTH sides, for the same reason the matching is: ranking
  // «أحمد علي» below «محمد أحمد» for a search of «احمد» — because the raw title
  // does not start with the raw query — puts the row the reader meant second.
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
      // The one center entity besides a student with a real detail page.
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
        // `rooms.search_text` covers both columns this used to narrow on, so
        // the pre-filter is now exact and indexed. The JS pass below is kept
        // for one honest reason: it is what every other provider in this file
        // runs, and a single provider deciding differently is the drift the
        // two-stage note above exists to prevent.
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
    // The staff member's TITLE is searchable too — «استقبال» finds the person
    // on the desk. It lives on the link, not on the user, so it can only join
    // the haystack here, after the two reads meet.
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
  { q, terms, frags }: Ctx,
): Promise<SearchHit[]> {
  // A receipt number is READ ALOUD and typed back, so it arrives with the
  // dashes in the wrong places or with none at all, and on an Arabic keypad its
  // digits arrive as ٠-٩. `normalizeIdentifier` reduces both sides to the same
  // bare string, which is the comparison the reader believes they are making.
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

    // A receipt number PASTED with its separators stripped («rcpnile202600004»)
    // is one token that appears nowhere in the raw column, so the fragment
    // pre-filter — which can only compare bytes — excludes the very row it
    // names. When it excludes everything, fall back to the center's most recent
    // receipts and let `normalizeIdentifier` decide. Bounded, and reached only
    // on a query that already found nothing, so the common path still costs one
    // narrowed query.
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

    // A parent wallet top-up carries no student. It is also not reachable here —
    // this provider is the CENTER's search and every candidate is narrowed to
    // the caller's center, while a top-up has a NULL center_id. The filter is
    // therefore about types being honest, not about a row that arrives: if the
    // narrowing ever widens, the search falls back to the receipt number rather
    // than crashing on a NULL id.
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
  { q, terms, frags }: Ctx,
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

/* ═══════════════════════════════════════════════════════════════════════════
 * STUDENT — their own groups. Deliberately the smallest surface of the four:
 * a student's portal is already short enough to scan, and widening their search
 * to teachers or centers would be a directory of adults, which is the one thing
 * a platform whose users are mostly minors must not hand out from a search box.
 * ═══════════════════════════════════════════════════════════════════════════ */

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

/* ═══════════════════════════════════════════════════════════════════════════
 * The one entry point.
 * ═══════════════════════════════════════════════════════════════════════════ */

export async function globalSearch(
  principal: SearchPrincipal,
  opts: { q: string; locale?: Locale },
): Promise<GlobalSearchResult> {
  const q = opts.q.trim();
  const ctx: Ctx = {
    q,
    locale: opts.locale === "en" ? "en" : "ar",
    // Computed ONCE for the whole request. Seven providers run in parallel and
    // every one of them needs the same two derivations of the same string.
    terms: searchTerms(q),
    frags: literalFragments(q),
  };

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
