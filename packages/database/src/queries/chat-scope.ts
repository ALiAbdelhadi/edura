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

export type ChatLimiter = (
  key: string,
  capacity: number,
  perMinute: number,
) => Promise<boolean>;

export const RATE_LIMITS = {
  send: { capacity: 30, perMinute: 20 },
  newConversation: { capacity: 10, perMinute: 3 },
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
  subtitle: string | null;
  mode: InitiationMode;
};

const ROSTER_CAP = 2000;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

const STAFF_FOR_FAMILIES: readonly CenterStaffRole[] = ["receptionist", "manager"];
const STAFF_FOR_TEACHING: readonly CenterStaffRole[] = ["manager"];

export type ResolvedActor = {
  actor: ChatActor;
  teacherIds: string[];
  centerId: string | null;
  staffRole: CenterStaffRole | null;
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
      const link = await db.centerStaff.findFirst({
        where: { staffUserId: actor.id, removedAt: null },
        select: { centerId: true, role: true },
      });
      return {
        ...base,
        centerId: link?.centerId ?? null,
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

type EdgeCtx = {
  db: TenantTx;
  self: ResolvedActor;
  narrowTo?: string;
  search?: string;
  limit: number;
};

const uniq = (xs: string[]) => [...new Set(xs)];
const cap = (ctx: EdgeCtx) => (ctx.narrowTo ? 1 : ROSTER_CAP);
const narrow = <K extends string>(ctx: EdgeCtx, key: K) =>
  (ctx.narrowTo ? { [key]: ctx.narrowTo } : {}) as Record<K, string> | object;

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

async function teachersOfCenter(ctx: EdgeCtx, centerId: string | null) {
  if (!centerId) return [];
  const rows = await ctx.db.centerTeacherAffiliation.findMany({
    where: { centerId, status: "active", ...narrow(ctx, "teacherId") },
    select: { teacherId: true },
    take: cap(ctx),
  });
  return uniq(rows.map((r) => r.teacherId));
}

async function centersOfTeachers(ctx: EdgeCtx, teacherIds: string[]) {
  if (!teacherIds.length) return [];
  const rows = await ctx.db.centerTeacherAffiliation.findMany({
    where: { teacherId: { in: teacherIds }, status: "active" },
    select: { centerId: true },
    take: ROSTER_CAP,
  });
  return uniq(rows.map((r) => r.centerId));
}

async function adminsOfCenters(ctx: EdgeCtx, centerIds: string[]) {
  if (!centerIds.length) return [];
  const rows = await ctx.db.centerAdminProfile.findMany({
    where: { centerId: { in: centerIds }, ...narrow(ctx, "userId") },
    select: { userId: true },
    take: cap(ctx),
  });
  return uniq(rows.map((r) => r.userId));
}

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

type EdgeSpec = {
  group: ContactGroup;
  role: Role;
  mode: InitiationMode;
  staffAllow?: readonly CenterStaffRole[];
  reach: (ctx: EdgeCtx) => Promise<string[]>;
  subtitle?: (ctx: EdgeCtx, ids: string[]) => Promise<Map<string, string>>;
};

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

const EDGES: Readonly<Record<Role, readonly EdgeSpec[]>> = {
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

  super_admin: [],
  accountant: [],
};

function edgeOpenToActor(edge: EdgeSpec, self: ResolvedActor): boolean {
  if (self.actor.role !== "center_staff") return true;
  if (!self.staffRole) return false;
  return (edge.staffAllow ?? []).includes(self.staffRole);
}

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

export type ReachDecision = {
  centerId: string | null;
  mode: InitiationMode;
  recipient: UserLite;
};

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

  const mode = conversationInitiationMode(actor.role, recipient.role);
  if (!mode) {
    throw new ChatError(
      "policy_denied",
      `${actor.role} may not start a conversation with ${recipient.role}`,
    );
  }

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

  const studentSide =
    actor.role === "student" ? actor.id : recipient.role === "student" ? recipient.id : null;
  const adultSide =
    actor.role === "student" ? recipient.role : recipient.role === "student" ? actor.role : null;
  if (studentSide && isAdultRole(adultSide) && (await isGuardianChannelLocked(db, studentSide))) {
    throw new ChatError("guardian_required", GUARDIAN_LOCK_MESSAGE);
  }

  await assertNotBlocked(db, actor.id, targetUserId);

  return {
    centerId: await tenancyFor(db, self, recipient as UserLite),
    mode,
    recipient: recipient as UserLite,
  };
}

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

export function reachableRoles(role: Role): Role[] {
  return [...new Set((EDGES[role] ?? []).map((e) => e.role))].filter(
    (r) => !!conversationInitiationMode(role, r),
  );
}
