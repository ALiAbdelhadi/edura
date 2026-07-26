// =============================================================================
// THE messaging authorization module. Every "may X message Y?" decision in the
// platform is answered here — REST, WebSocket, group posts, and the contacts
// directory all funnel through this file.
//
// -----------------------------------------------------------------------------
// WHY ONE TABLE: the gate and the directory used to be two hand-written
// switches (assertRelationship + listContacts). Two copies of the same rules
// drift, and the drift is silent: the directory starts offering someone the
// gate would reject, or hides someone it would allow. So there is now exactly
// ONE definition of every relationship — the EDGES table below — and it is
// PARAMETERIZED rather than duplicated:
//
//     narrowTo set    → "can the actor reach THIS one user?"   (the gate)
//     narrowTo unset  → "who can the actor reach?"             (the directory)
//
// Same predicates, same joins, one code path. A drift test asserts
// listContacts() returns exactly the ids assertCanReach() accepts.
//
// -----------------------------------------------------------------------------
// THE GATES, in order (all must pass):
//   1. MATRIX      — chat-policy.ts: is this role PAIR allowed at all?
//   2. RELATIONSHIP— EDGES: is there a real platform relationship (enrollment,
//                    team link, parent link, center affiliation) behind it?
//   3. BLOCK       — has either side blocked the other?
//   4. RATE LIMIT  — applied by the caller through the injected ChatLimiter.
//
// -----------------------------------------------------------------------------
// DEFAULT-DENY: `EDGES[role] ?? []`. A role absent from the table reaches
// NOBODY, and an edge that a center-staff sub-role is not explicitly listed on
// is closed to that sub-role. There is no denylist to forget to update — new
// roles and new sub-roles fail closed until deliberately opened, exactly like
// the Step 8 assistant boundary and the center-staff boundary.
// =============================================================================

import type { TenantTx } from "../client";
import type {
  CenterStaffRole,
  Role,
} from "../generated/client/index";
import {
  conversationInitiationMode,
  type InitiationMode,
} from "./chat-policy";
import { isAdultRole } from "./chat-minors";
import {
  GUARDIAN_LOCK_MESSAGE,
  guardianLockedStudentIds,
  isGuardianChannelLocked,
} from "./chat-guardian";

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------
export type ChatErrorCode =
  | "recipient_not_found"
  | "policy_denied"
  | "no_relationship"
  | "guardian_required"
  | "blocked"
  | "rate_limited"
  | "conversation_not_found"
  | "group_not_found"
  | "not_participant"
  | "invalid_body";

export class ChatError extends Error {
  constructor(
    public readonly code: ChatErrorCode,
    message?: string,
  ) {
    super(message ?? code);
    this.name = "ChatError";
  }
}

export type ChatActor = {
  id: string;
  role: Role;
  centerId?: string | null;
};

/**
 * Rate-limit port. Injected so this package never depends on the server-core
 * limiter (or on Redis). It is a REQUIRED argument on every send path, so a new
 * transport that forgets to pass one fails to COMPILE rather than shipping an
 * unlimited channel — the socket path was exactly that gap before.
 */
export type ChatLimiter = (
  key: string,
  capacity: number,
  perMinute: number,
) => Promise<boolean>;

/** Buckets are keyed on the USER, not the IP — rotating IPs must not reset them. */
export const RATE_LIMITS = {
  /** Messages into existing conversations. */
  send: { capacity: 30, perMinute: 20 },
  /** Opening NEW conversations — the harassment-relevant one. */
  newConversation: { capacity: 10, perMinute: 3 },
  /** Posting into a group channel. */
  groupSend: { capacity: 10, perMinute: 5 },
} as const;

export async function consume(
  limiter: ChatLimiter,
  key: string,
  limit: { capacity: number; perMinute: number },
  message: string,
): Promise<void> {
  if (!(await limiter(key, limit.capacity, limit.perMinute))) {
    throw new ChatError("rate_limited", message);
  }
}

// ---------------------------------------------------------------------------
// Contact shapes
// ---------------------------------------------------------------------------
export type ContactGroup =
  | "assistants"
  | "teachers"
  | "team"
  | "centers"
  | "staff"
  | "students"
  | "parents"
  | "platform";

export type UserLite = { id: string; name: string; role: Role };

export type ContactView = {
  id: string;
  name: string;
  role: Role;
  group: ContactGroup;
  /** Context line, e.g. the teacher a contact assists or the center name. */
  subtitle: string | null;
  mode: InitiationMode;
};

// Rosters can hold thousands; the directory is search-first, so every
// unnarrowed relation lookup is capped.
const ROSTER_CAP = 2000;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

// Which center-staff sub-roles may talk to which counterpart. Defined ONCE and
// used by BOTH directions of every staff edge, so "staff → student" and
// "student → staff" can never disagree about who is reachable.
const STAFF_FOR_FAMILIES: readonly CenterStaffRole[] = ["receptionist", "manager"];
const STAFF_FOR_TEACHING: readonly CenterStaffRole[] = ["manager"];

// ---------------------------------------------------------------------------
// Resolved actor — the actor's principal context, looked up once per call.
// ---------------------------------------------------------------------------
export type ResolvedActor = {
  actor: ChatActor;
  /** teacher: [self]. assistant: the ONE teacher they serve. Otherwise []. */
  teacherIds: string[];
  /** center_admin / center_staff: their center. */
  centerId: string | null;
  /** center_staff only; null for the center owner (who is never sub-role gated). */
  staffRole: CenterStaffRole | null;
  /** parent: approved children. */
  childIds: string[];
};

export async function resolveActor(
  db: TenantTx,
  actor: ChatActor,
): Promise<ResolvedActor> {
  const base: ResolvedActor = {
    actor,
    teacherIds: [],
    centerId: null,
    staffRole: null,
    childIds: [],
  };

  switch (actor.role) {
    case "teacher":
      return { ...base, teacherIds: [actor.id] };

    case "assistant": {
      // THE Step 8 boundary, reused verbatim: exactly one live teacher link.
      // Revoking it (removedAt) collapses the assistant's whole messaging
      // scope on the very next call. Never widened here.
      const link = await db.teacherAssistant.findFirst({
        where: { assistantId: actor.id, removedAt: null },
        select: { teacherId: true },
      });
      return { ...base, teacherIds: link ? [link.teacherId] : [] };
    }

    case "center_admin": {
      const centerId =
        actor.centerId ??
        (
          await db.centerAdminProfile.findFirst({
            where: { userId: actor.id },
            select: { centerId: true },
          })
        )?.centerId ??
        null;
      return { ...base, centerId };
    }

    case "center_staff": {
      // Mirrors resolveCenterActorContext: a live link, revocation-aware.
      const link = await db.centerStaff.findFirst({
        where: { staffUserId: actor.id, removedAt: null },
        select: { centerId: true, role: true },
      });
      return {
        ...base,
        centerId: link?.centerId ?? null,
        // No live link ⇒ no sub-role ⇒ every staff edge is closed (they all
        // require an explicit staffAllow match).
        staffRole: link?.role ?? ("center_accountant" as CenterStaffRole),
      };
    }

    case "parent": {
      const links = await db.parentStudentLink.findMany({
        where: { parentId: actor.id, status: "approved" },
        select: { studentId: true },
      });
      return { ...base, childIds: links.map((l) => l.studentId) };
    }

    default:
      return base;
  }
}

// ---------------------------------------------------------------------------
// Relation primitives — the ONLY place a messaging relationship is expressed.
// Each pushes `narrowTo` into its WHERE clause, so the gate costs one indexed
// lookup instead of materializing a 2000-row roster.
// ---------------------------------------------------------------------------

type EdgeCtx = {
  db: TenantTx;
  self: ResolvedActor;
  /** Check ONE candidate (gate) vs list the bucket (directory). */
  narrowTo?: string;
  search?: string;
  limit: number;
};

const uniq = (xs: string[]) => [...new Set(xs)];
const cap = (ctx: EdgeCtx) => (ctx.narrowTo ? 1 : ROSTER_CAP);
const narrow = <K extends string>(ctx: EdgeCtx, key: K) =>
  (ctx.narrowTo ? { [key]: ctx.narrowTo } : {}) as Record<K, string> | object;

/** Students actively enrolled in a course taught by one of `teacherIds`. */
async function studentsOfTeachers(ctx: EdgeCtx, teacherIds: string[]) {
  if (!teacherIds.length) return [];
  const rows = await ctx.db.enrollment.findMany({
    where: {
      status: "active",
      course: { teacherId: { in: teacherIds } },
      ...narrow(ctx, "studentId"),
    },
    select: { studentId: true },
    take: cap(ctx),
  });
  return uniq(rows.map((r) => r.studentId));
}

/** Teachers a set of students actively study with. */
async function teachersOfStudents(ctx: EdgeCtx, studentIds: string[]) {
  if (!studentIds.length) return [];
  const rows = await ctx.db.enrollment.findMany({
    where: {
      studentId: { in: studentIds },
      status: "active",
      ...(ctx.narrowTo ? { course: { teacherId: ctx.narrowTo } } : {}),
    },
    select: { course: { select: { teacherId: true } } },
    take: cap(ctx),
  });
  return uniq(rows.map((r) => r.course.teacherId));
}

/** Active assistants of `teacherIds` (the teachers' own teams). */
async function assistantsOfTeachers(ctx: EdgeCtx, teacherIds: string[]) {
  if (!teacherIds.length) return [];
  const rows = await ctx.db.teacherAssistant.findMany({
    where: {
      teacherId: { in: teacherIds },
      removedAt: null,
      ...narrow(ctx, "assistantId"),
    },
    select: { assistantId: true },
    take: cap(ctx),
  });
  return uniq(rows.map((r) => r.assistantId));
}

/** Approved parents of a set of students. */
async function parentsOfStudents(ctx: EdgeCtx, studentIds: string[]) {
  if (!studentIds.length) return [];
  const rows = await ctx.db.parentStudentLink.findMany({
    where: {
      studentId: { in: studentIds },
      status: "approved",
      ...narrow(ctx, "parentId"),
    },
    select: { parentId: true },
    take: cap(ctx),
  });
  return uniq(rows.map((r) => r.parentId));
}

/**
 * Centers a set of students belong to — enrollment OR roster. BOTH are checked
 * because walk-in students sit on the roster with no enrollment yet; using only
 * enrollments here while the center side checks both would make the edge
 * asymmetric (the center could message the student but not vice versa).
 */
async function centersOfStudents(ctx: EdgeCtx, studentIds: string[]) {
  if (!studentIds.length) return [];
  const [enrolled, roster] = await Promise.all([
    ctx.db.enrollment.findMany({
      where: { studentId: { in: studentIds }, status: "active", centerId: { not: null } },
      select: { centerId: true },
      take: ROSTER_CAP,
    }),
    ctx.db.centerStudentRoster.findMany({
      where: { studentId: { in: studentIds }, leftAt: null },
      select: { centerId: true },
      take: ROSTER_CAP,
    }),
  ]);
  return uniq([
    ...enrolled.map((e) => e.centerId).filter((id): id is string => !!id),
    ...roster.map((r) => r.centerId),
  ]);
}

/** Students of a center — enrollment OR roster (mirror of centersOfStudents). */
async function studentsOfCenter(ctx: EdgeCtx, centerId: string | null) {
  if (!centerId) return [];
  const [enrolled, roster] = await Promise.all([
    ctx.db.enrollment.findMany({
      where: { centerId, status: "active", ...narrow(ctx, "studentId") },
      select: { studentId: true },
      take: cap(ctx),
    }),
    ctx.db.centerStudentRoster.findMany({
      where: { centerId, leftAt: null, ...narrow(ctx, "studentId") },
      select: { studentId: true },
      take: cap(ctx),
    }),
  ]);
  return uniq([...enrolled.map((e) => e.studentId), ...roster.map((r) => r.studentId)]);
}

/** Teachers actively affiliated with a center. */
async function teachersOfCenter(ctx: EdgeCtx, centerId: string | null) {
  if (!centerId) return [];
  const rows = await ctx.db.centerTeacherAffiliation.findMany({
    where: { centerId, status: "active", ...narrow(ctx, "teacherId") },
    select: { teacherId: true },
    take: cap(ctx),
  });
  return uniq(rows.map((r) => r.teacherId));
}

/** Centers a set of teachers is actively affiliated with. */
async function centersOfTeachers(ctx: EdgeCtx, teacherIds: string[]) {
  if (!teacherIds.length) return [];
  const rows = await ctx.db.centerTeacherAffiliation.findMany({
    where: { teacherId: { in: teacherIds }, status: "active" },
    select: { centerId: true },
    take: ROSTER_CAP,
  });
  return uniq(rows.map((r) => r.centerId));
}

/** Owner/admin users of a set of centers. */
async function adminsOfCenters(ctx: EdgeCtx, centerIds: string[]) {
  if (!centerIds.length) return [];
  const rows = await ctx.db.centerAdminProfile.findMany({
    where: { centerId: { in: centerIds }, ...narrow(ctx, "userId") },
    select: { userId: true },
    take: cap(ctx),
  });
  return uniq(rows.map((r) => r.userId));
}

/**
 * Staff users of a set of centers, restricted to the sub-roles that are
 * allowed to hold this kind of conversation. Uses the SAME constants as the
 * staff-side edges, so both directions agree by construction.
 */
async function staffOfCenters(
  ctx: EdgeCtx,
  centerIds: string[],
  allow: readonly CenterStaffRole[],
) {
  if (!centerIds.length || !allow.length) return [];
  const rows = await ctx.db.centerStaff.findMany({
    where: {
      centerId: { in: centerIds },
      removedAt: null,
      role: { in: [...allow] },
      ...narrow(ctx, "staffUserId"),
    },
    select: { staffUserId: true },
    take: cap(ctx),
  });
  return uniq(rows.map((r) => r.staffUserId));
}

// ---------------------------------------------------------------------------
// Turn candidate ids into real, active users (applies the name search).
// ---------------------------------------------------------------------------
async function selectUsers(
  ctx: EdgeCtx,
  ids: string[],
  role: Role,
): Promise<UserLite[]> {
  if (!ids.length) return [];
  const rows = await ctx.db.user.findMany({
    where: {
      id: { in: ids },
      role,
      status: "active",
      deletedAt: null,
      ...(ctx.search
        ? { name: { contains: ctx.search, mode: "insensitive" as const } }
        : {}),
    },
    select: { id: true, name: true, role: true },
    orderBy: { name: "asc" },
    take: ctx.narrowTo ? 1 : ctx.limit,
  });
  return rows as UserLite[];
}

// ---------------------------------------------------------------------------
// THE EDGE TABLE. One row per (actor role → reachable population).
// ---------------------------------------------------------------------------
type EdgeSpec = {
  group: ContactGroup;
  /** The role of the users this edge yields. */
  role: Role;
  mode: InitiationMode;
  /**
   * Which center-staff sub-roles may use this edge. Omitted ⇒ NO staff may
   * (default-closed). Ignored for non-staff actors.
   */
  staffAllow?: readonly CenterStaffRole[];
  reach: (ctx: EdgeCtx) => Promise<string[]>;
  /** Optional context line ("assists <teacher>", "<center name>"). */
  subtitle?: (ctx: EdgeCtx, ids: string[]) => Promise<Map<string, string>>;
};

// -- subtitle helpers --------------------------------------------------------

async function assistantSubtitles(ctx: EdgeCtx, assistantIds: string[]) {
  const out = new Map<string, string>();
  if (!assistantIds.length) return out;
  const links = await ctx.db.teacherAssistant.findMany({
    where: { assistantId: { in: assistantIds }, removedAt: null },
    select: { assistantId: true, teacherId: true },
  });
  const teachers = await ctx.db.user.findMany({
    where: { id: { in: uniq(links.map((l) => l.teacherId)) } },
    select: { id: true, name: true },
  });
  const names = new Map(teachers.map((t) => [t.id, t.name]));
  for (const l of links) {
    const n = names.get(l.teacherId);
    if (n && !out.has(l.assistantId)) out.set(l.assistantId, n);
  }
  return out;
}

async function centerPeopleSubtitles(ctx: EdgeCtx, userIds: string[]) {
  const out = new Map<string, string>();
  if (!userIds.length) return out;
  const [admins, staff] = await Promise.all([
    ctx.db.centerAdminProfile.findMany({
      where: { userId: { in: userIds } },
      select: { userId: true, centerId: true },
    }),
    ctx.db.centerStaff.findMany({
      where: { staffUserId: { in: userIds }, removedAt: null },
      select: { staffUserId: true, centerId: true },
    }),
  ]);
  const pairs = [
    ...admins.map((a) => [a.userId, a.centerId] as const),
    ...staff.map((s) => [s.staffUserId, s.centerId] as const),
  ];
  const centers = await ctx.db.center.findMany({
    where: { id: { in: uniq(pairs.map(([, c]) => c)) } },
    select: { id: true, name: true },
  });
  const names = new Map(centers.map((c) => [c.id, c.name]));
  for (const [uid, cid] of pairs) {
    const n = names.get(cid);
    if (n && !out.has(uid)) out.set(uid, n);
  }
  return out;
}

/**
 * Reachability, per actor role. Order matters only for the directory's display
 * order — the assistants bucket stays first for students/parents so the
 * assistant-first convention survives as UX guidance even though the teacher
 * is now directly reachable.
 */
const EDGES: Readonly<Record<Role, readonly EdgeSpec[]>> = {
  // ---- STUDENT: their own teachers, those teachers' assistants, their centers.
  student: [
    {
      group: "assistants",
      role: "assistant",
      mode: "open",
      subtitle: assistantSubtitles,
      reach: async (ctx) =>
        assistantsOfTeachers(
          ctx,
          await teachersOfStudents({ ...ctx, narrowTo: undefined }, [ctx.self.actor.id]),
        ),
    },
    {
      group: "teachers",
      role: "teacher",
      mode: "open",
      reach: (ctx) => teachersOfStudents(ctx, [ctx.self.actor.id]),
    },
    {
      group: "centers",
      role: "center_admin",
      mode: "open",
      subtitle: centerPeopleSubtitles,
      reach: async (ctx) =>
        adminsOfCenters(
          ctx,
          await centersOfStudents({ ...ctx, narrowTo: undefined }, [ctx.self.actor.id]),
        ),
    },
    {
      group: "staff",
      role: "center_staff",
      mode: "open",
      subtitle: centerPeopleSubtitles,
      reach: async (ctx) =>
        staffOfCenters(
          ctx,
          await centersOfStudents({ ...ctx, narrowTo: undefined }, [ctx.self.actor.id]),
          STAFF_FOR_FAMILIES,
        ),
    },
  ],

  // ---- PARENT: EXACTLY their approved children's scope, nothing more.
  parent: [
    {
      group: "assistants",
      role: "assistant",
      mode: "open",
      subtitle: assistantSubtitles,
      reach: async (ctx) =>
        assistantsOfTeachers(
          ctx,
          await teachersOfStudents({ ...ctx, narrowTo: undefined }, ctx.self.childIds),
        ),
    },
    {
      group: "teachers",
      role: "teacher",
      mode: "open",
      reach: (ctx) => teachersOfStudents(ctx, ctx.self.childIds),
    },
    {
      group: "centers",
      role: "center_admin",
      mode: "open",
      subtitle: centerPeopleSubtitles,
      reach: async (ctx) =>
        adminsOfCenters(
          ctx,
          await centersOfStudents({ ...ctx, narrowTo: undefined }, ctx.self.childIds),
        ),
    },
    {
      group: "staff",
      role: "center_staff",
      mode: "open",
      subtitle: centerPeopleSubtitles,
      reach: async (ctx) =>
        staffOfCenters(
          ctx,
          await centersOfStudents({ ...ctx, narrowTo: undefined }, ctx.self.childIds),
          STAFF_FOR_FAMILIES,
        ),
    },
  ],

  // ---- TEACHER: own team, own students + their parents, affiliated centers.
  teacher: [
    {
      group: "team",
      role: "assistant",
      mode: "open",
      reach: (ctx) => assistantsOfTeachers(ctx, ctx.self.teacherIds),
    },
    {
      group: "students",
      role: "student",
      mode: "open",
      reach: (ctx) => studentsOfTeachers(ctx, ctx.self.teacherIds),
    },
    {
      group: "parents",
      role: "parent",
      mode: "open",
      reach: async (ctx) =>
        parentsOfStudents(
          ctx,
          await studentsOfTeachers({ ...ctx, narrowTo: undefined }, ctx.self.teacherIds),
        ),
    },
    {
      group: "centers",
      role: "center_admin",
      mode: "open",
      subtitle: centerPeopleSubtitles,
      reach: async (ctx) =>
        adminsOfCenters(ctx, await centersOfTeachers(ctx, ctx.self.teacherIds)),
    },
    {
      group: "staff",
      role: "center_staff",
      mode: "open",
      subtitle: centerPeopleSubtitles,
      reach: async (ctx) =>
        staffOfCenters(
          ctx,
          await centersOfTeachers(ctx, ctx.self.teacherIds),
          STAFF_FOR_TEACHING,
        ),
    },
  ],

  // ---- ASSISTANT: strictly their ONE teacher's world (Step 8 boundary).
  //      resolveActor() yields at most one teacherId, so every edge below is
  //      automatically confined to that teacher — reaching a second teacher's
  //      students is impossible by construction, not by a check.
  assistant: [
    {
      group: "teachers",
      role: "teacher",
      mode: "open",
      reach: async (ctx) =>
        ctx.narrowTo
          ? ctx.self.teacherIds.filter((id) => id === ctx.narrowTo)
          : ctx.self.teacherIds,
    },
    {
      group: "students",
      role: "student",
      mode: "open",
      reach: (ctx) => studentsOfTeachers(ctx, ctx.self.teacherIds),
    },
    {
      group: "parents",
      role: "parent",
      mode: "open",
      reach: async (ctx) =>
        parentsOfStudents(
          ctx,
          await studentsOfTeachers({ ...ctx, narrowTo: undefined }, ctx.self.teacherIds),
        ),
    },
    {
      group: "centers",
      role: "center_admin",
      mode: "open",
      subtitle: centerPeopleSubtitles,
      reach: async (ctx) =>
        adminsOfCenters(ctx, await centersOfTeachers(ctx, ctx.self.teacherIds)),
    },
    {
      group: "staff",
      role: "center_staff",
      mode: "open",
      subtitle: centerPeopleSubtitles,
      reach: async (ctx) =>
        staffOfCenters(
          ctx,
          await centersOfTeachers(ctx, ctx.self.teacherIds),
          STAFF_FOR_TEACHING,
        ),
    },
  ],

  // ---- CENTER ADMIN: own center's people only. centerId comes from the
  //      admin's own profile, so another center's roster is unreachable.
  center_admin: [
    {
      group: "teachers",
      role: "teacher",
      mode: "open",
      reach: (ctx) => teachersOfCenter(ctx, ctx.self.centerId),
    },
    {
      group: "assistants",
      role: "assistant",
      mode: "open",
      subtitle: assistantSubtitles,
      reach: async (ctx) =>
        assistantsOfTeachers(
          ctx,
          await teachersOfCenter({ ...ctx, narrowTo: undefined }, ctx.self.centerId),
        ),
    },
    {
      group: "students",
      role: "student",
      mode: "open",
      reach: (ctx) => studentsOfCenter(ctx, ctx.self.centerId),
    },
    {
      group: "parents",
      role: "parent",
      mode: "open",
      reach: async (ctx) =>
        parentsOfStudents(
          ctx,
          await studentsOfCenter({ ...ctx, narrowTo: undefined }, ctx.self.centerId),
        ),
    },
  ],

  // ---- CENTER STAFF: the center's scope, narrowed by preset sub-role.
  //      receptionist → families (front desk). manager → the whole center
  //      scope. center_accountant → appears on NO edge, so it reaches nobody:
  //      the read-only finance tier has no messaging surface at all.
  center_staff: [
    {
      group: "students",
      role: "student",
      mode: "open",
      staffAllow: STAFF_FOR_FAMILIES,
      reach: (ctx) => studentsOfCenter(ctx, ctx.self.centerId),
    },
    {
      group: "parents",
      role: "parent",
      mode: "open",
      staffAllow: STAFF_FOR_FAMILIES,
      reach: async (ctx) =>
        parentsOfStudents(
          ctx,
          await studentsOfCenter({ ...ctx, narrowTo: undefined }, ctx.self.centerId),
        ),
    },
    {
      group: "teachers",
      role: "teacher",
      mode: "open",
      staffAllow: STAFF_FOR_TEACHING,
      reach: (ctx) => teachersOfCenter(ctx, ctx.self.centerId),
    },
    {
      group: "assistants",
      role: "assistant",
      mode: "open",
      staffAllow: STAFF_FOR_TEACHING,
      subtitle: assistantSubtitles,
      reach: async (ctx) =>
        assistantsOfTeachers(
          ctx,
          await teachersOfCenter({ ...ctx, narrowTo: undefined }, ctx.self.centerId),
        ),
    },
  ],

  // ---- BACK OFFICE: no messaging surface whatsoever. They read the log.
  super_admin: [],
  accountant: [],
};

/** A staff sub-role may only use edges that name it. Owners bypass the gate. */
function edgeOpenToActor(edge: EdgeSpec, self: ResolvedActor): boolean {
  if (self.actor.role !== "center_staff") return true;
  if (!self.staffRole) return false;
  return (edge.staffAllow ?? []).includes(self.staffRole);
}

/**
 * The DIRECTORY half of GATE 3. `assertCanReach` decides one pair; this decides
 * a whole edge's worth at once, from the SAME predicate — so the auto-search
 * can never offer a contact the gate would then refuse. The drift proof asserts
 * set-equality between the two, which is what keeps these honest.
 *
 * Two directions, one rule:
 *   - a locked STUDENT actor loses every adult-role edge outright;
 *   - an ADULT actor loses the locked students from their student edge.
 */
async function guardianFilter(
  ctx: EdgeCtx,
  ids: string[],
  edgeRole: Role,
): Promise<string[]> {
  const actorRole = ctx.self.actor.role;

  if (actorRole === "student") {
    if (!isAdultRole(edgeRole)) return ids;
    return (await isGuardianChannelLocked(ctx.db, ctx.self.actor.id)) ? [] : ids;
  }

  if (edgeRole === "student" && isAdultRole(actorRole)) {
    if (!ids.length) return ids;
    const locked = await guardianLockedStudentIds(ctx.db, ids);
    return ids.filter((id) => !locked.has(id));
  }

  return ids;
}

// ---------------------------------------------------------------------------
// BLOCKS
// ---------------------------------------------------------------------------

/**
 * A block halts NEW messages in BOTH directions — the blocked party cannot
 * write, and the blocker cannot either until they unblock. History is never
 * touched, and this has no effect on parent oversight or the super-admin log:
 * an adult cannot use a block to bury a thread with a minor.
 */
export async function assertNotBlocked(
  db: TenantTx,
  userA: string,
  userB: string,
): Promise<void> {
  const block = await db.conversationBlock.findFirst({
    where: {
      removedAt: null,
      OR: [
        { blockerId: userA, blockedId: userB },
        { blockerId: userB, blockedId: userA },
      ],
    },
    select: { id: true, blockerId: true },
  });
  if (!block) return;
  throw new ChatError(
    "blocked",
    block.blockerId === userA
      ? "You have blocked this user. Unblock them to send a message."
      : "You can no longer send messages in this conversation.",
  );
}

// ---------------------------------------------------------------------------
// THE GATE
// ---------------------------------------------------------------------------

export type ReachDecision = {
  /** Center to stamp on the conversation for tenancy (null for non-center pairs). */
  centerId: string | null;
  mode: InitiationMode;
  recipient: UserLite;
};

/**
 * "May `actor` open a conversation with `targetUserId`?" — the ONE gate.
 * Throws ChatError on every denial; returns the tenancy context on success.
 */
export async function assertCanReach(
  db: TenantTx,
  actor: ChatActor,
  targetUserId: string,
): Promise<ReachDecision> {
  if (targetUserId === actor.id) {
    throw new ChatError("policy_denied", "Cannot start a conversation with yourself");
  }

  const recipient = await db.user.findFirst({
    where: { id: targetUserId, deletedAt: null, status: "active" },
    select: { id: true, name: true, role: true },
  });
  if (!recipient) throw new ChatError("recipient_not_found");

  // GATE 1 — role pair.
  const mode = conversationInitiationMode(actor.role, recipient.role);
  if (!mode) {
    throw new ChatError(
      "policy_denied",
      `${actor.role} may not start a conversation with ${recipient.role}`,
    );
  }

  // GATE 2 — a real relationship, via the same edges the directory uses.
  const self = await resolveActor(db, actor);
  const ctx: EdgeCtx = {
    db,
    self,
    narrowTo: targetUserId,
    limit: 1,
  };

  let matched = false;
  for (const edge of EDGES[actor.role] ?? []) {
    if (edge.role !== recipient.role) continue;
    if (!edgeOpenToActor(edge, self)) continue;
    const ids = await edge.reach(ctx);
    if (ids.includes(targetUserId)) {
      matched = true;
      break;
    }
  }
  if (!matched) {
    throw new ChatError(
      "no_relationship",
      `No platform relationship between ${actor.role} and ${recipient.role}`,
    );
  }

  // GATE 3 — guardian channel (child safety). A MINOR with no guardian EMAIL
  // on file may not open an adult-facing thread, and no adult may open one with
  // them. Applied to whichever side of the pair is the student; `parent` is not
  // an adult role, so a child is never cut off from their own guardian.
  const studentSide =
    actor.role === "student" ? actor.id : recipient.role === "student" ? recipient.id : null;
  const adultSide =
    actor.role === "student" ? recipient.role : recipient.role === "student" ? actor.role : null;
  if (studentSide && isAdultRole(adultSide) && (await isGuardianChannelLocked(db, studentSide))) {
    throw new ChatError("guardian_required", GUARDIAN_LOCK_MESSAGE);
  }

  // GATE 4 — blocks.
  await assertNotBlocked(db, actor.id, targetUserId);

  return {
    centerId: await tenancyFor(db, self, recipient as UserLite),
    mode,
    recipient: recipient as UserLite,
  };
}

/**
 * Which center (if any) owns this conversation, for RLS tenancy. Set whenever
 * one side is a center principal; NULL for teacher↔student style pairs, which
 * matches the existing conversations RLS policy (NULL center_id rows are
 * visible only under the platform context).
 */
async function tenancyFor(
  db: TenantTx,
  self: ResolvedActor,
  recipient: UserLite,
): Promise<string | null> {
  if (self.centerId) return self.centerId;
  if (recipient.role === "center_admin") {
    const p = await db.centerAdminProfile.findFirst({
      where: { userId: recipient.id },
      select: { centerId: true },
    });
    return p?.centerId ?? null;
  }
  if (recipient.role === "center_staff") {
    const s = await db.centerStaff.findFirst({
      where: { staffUserId: recipient.id, removedAt: null },
      select: { centerId: true },
    });
    return s?.centerId ?? null;
  }
  return null;
}

/**
 * Non-throwing variant — used by the drift proof and by UI affordances that
 * need a boolean rather than an exception.
 */
export async function canReach(
  db: TenantTx,
  actor: ChatActor,
  targetUserId: string,
): Promise<boolean> {
  try {
    await assertCanReach(db, actor, targetUserId);
    return true;
  } catch (e) {
    if (e instanceof ChatError) return false;
    throw e;
  }
}

// ---------------------------------------------------------------------------
// THE DIRECTORY — same edges, unnarrowed. "Auto-search" surfaces only the
// actor's own people because it is literally the same query the gate runs.
// ---------------------------------------------------------------------------
export async function listContacts(
  db: TenantTx,
  actor: ChatActor,
  opts: { search?: string; limit?: number } = {},
): Promise<ContactView[]> {
  const limit = Math.min(Math.max(opts.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
  const self = await resolveActor(db, actor);
  const ctx: EdgeCtx = {
    db,
    self,
    search: opts.search?.trim() || undefined,
    limit,
  };

  const contacts: ContactView[] = [];
  const seen = new Set<string>([actor.id]);

  for (const edge of EDGES[actor.role] ?? []) {
    if (!edgeOpenToActor(edge, self)) continue;
    // Defense in depth: the matrix must also allow the pair. The two tables are
    // edited together, but if they ever disagree the stricter one wins.
    if (!conversationInitiationMode(actor.role, edge.role)) continue;

    const ids = await guardianFilter(ctx, await edge.reach(ctx), edge.role);
    const users = await selectUsers(ctx, ids, edge.role);
    if (!users.length) continue;

    const subtitles = edge.subtitle
      ? await edge.subtitle(ctx, users.map((u) => u.id))
      : undefined;

    for (const u of users) {
      if (seen.has(u.id)) continue;
      seen.add(u.id);
      contacts.push({
        id: u.id,
        name: u.name,
        role: u.role,
        group: edge.group,
        mode: edge.mode,
        subtitle: subtitles?.get(u.id) ?? null,
      });
    }
  }

  return contacts;
}

/** Introspection for the default-deny proof: which roles can this role reach? */
export function reachableRoles(role: Role): Role[] {
  return [...new Set((EDGES[role] ?? []).map((e) => e.role))].filter(
    (r) => !!conversationInitiationMode(role, r),
  );
}
