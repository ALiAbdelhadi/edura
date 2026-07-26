// =============================================================================
// GROUP CHANNELS — membership DERIVED from real platform relationships.
//
// The invariant that makes this safe: `group_members` is a CACHE (fanout,
// unread counters, listing). It is NEVER the authorization source.
// `assertGroupAccess` re-derives the answer live for the ONE user being
// checked, using the same narrow-to-one-user trick as chat-scope.ts. So a
// stale cache row grants nothing: a student who dropped the course cannot
// read or post the moment their enrollment goes inactive, even if their
// cached membership row is still sitting there.
//
// Membership sources (one per kind, enforced by a DB CHECK):
//   course              → active enrollments in that course
//   session             → active enrollments in the session's course
//   center_announcement → the center's roster ∪ its active enrollments
// plus, in every case, the teaching side: the course teacher, that teacher's
// ACTIVE assistants, the owning center's admins and its manager/receptionist
// staff, and the enrolled students' APPROVED parents.
// =============================================================================

import type { TenantTx } from "../client";
import type {
  ConversationGroup,
  GroupKind,
  GroupMessage,
  Role,
} from "../generated/client/index";
import {
  ChatError,
  consume,
  RATE_LIMITS,
  type ChatActor,
  type ChatLimiter,
} from "./chat-scope";
import { GUARDIAN_LOCK_MESSAGE, isGuardianChannelLocked } from "./chat-guardian";
import { MAX_MESSAGE_LENGTH, PREVIEW_LENGTH, REMOVED_BODY } from "./chat";

const ROSTER_CAP = 5000;

export type GroupAction = "read" | "post" | "manage";

export type GroupMessageView = {
  id: string;
  groupId: string;
  senderId: string;
  seq: number;
  body: string;
  clientId: string | null;
  createdAt: Date;
  deleted: boolean;
};

export type GroupView = {
  id: string;
  kind: GroupKind;
  title: string;
  courseId: string | null;
  sessionId: string | null;
  centerId: string | null;
  ownerId: string;
  postPolicy: "owner_only" | "members";
  memberCount: number;
  lastMessageAt: Date;
  lastMessagePreview: string | null;
  lastMessageSenderId: string | null;
  unreadCount: number;
  canPost: boolean;
  muted: boolean;
};

export function toGroupMessageView(m: GroupMessage): GroupMessageView {
  const deleted = !!m.deletedAt;
  return {
    id: m.id,
    groupId: m.groupId,
    senderId: m.senderId,
    seq: Number(m.seq),
    body: deleted ? REMOVED_BODY : m.body,
    clientId: m.clientId,
    createdAt: m.createdAt,
    deleted,
  };
}

// ---------------------------------------------------------------------------
// DERIVATION — the single definition of "who belongs to this group".
// ---------------------------------------------------------------------------

type DerivedSide = { userId: string; role: Role };

/**
 * The teaching/owning side of a group: teacher, their active assistants, the
 * center's admins, and the center's staff who are allowed family contact.
 * These are the principals that may POST under `owner_only`.
 */
async function teachingSide(
  db: TenantTx,
  opts: { teacherId?: string | null; centerId?: string | null },
  narrowTo?: string,
): Promise<DerivedSide[]> {
  const out: DerivedSide[] = [];

  if (opts.teacherId && (!narrowTo || narrowTo === opts.teacherId)) {
    out.push({ userId: opts.teacherId, role: "teacher" });
  }
  if (opts.teacherId) {
    const assistants = await db.teacherAssistant.findMany({
      where: {
        teacherId: opts.teacherId,
        removedAt: null,
        ...(narrowTo ? { assistantId: narrowTo } : {}),
      },
      select: { assistantId: true },
      take: narrowTo ? 1 : 100,
    });
    out.push(
      ...assistants.map((a) => ({ userId: a.assistantId, role: "assistant" as Role })),
    );
  }
  if (opts.centerId) {
    const [admins, staff] = await Promise.all([
      db.centerAdminProfile.findMany({
        where: { centerId: opts.centerId, ...(narrowTo ? { userId: narrowTo } : {}) },
        select: { userId: true },
        take: narrowTo ? 1 : 50,
      }),
      db.centerStaff.findMany({
        where: {
          centerId: opts.centerId,
          removedAt: null,
          role: { in: ["receptionist", "manager"] },
          ...(narrowTo ? { staffUserId: narrowTo } : {}),
        },
        select: { staffUserId: true },
        take: narrowTo ? 1 : 200,
      }),
    ]);
    out.push(...admins.map((a) => ({ userId: a.userId, role: "center_admin" as Role })));
    out.push(
      ...staff.map((s) => ({ userId: s.staffUserId, role: "center_staff" as Role })),
    );
  }
  return out;
}

/** Student ids that back a group, per kind. */
async function derivedStudentIds(
  db: TenantTx,
  group: Pick<ConversationGroup, "kind" | "courseId" | "centerId">,
  narrowTo?: string,
): Promise<string[]> {
  if (group.kind === "center_announcement") {
    if (!group.centerId) return [];
    const [enrolled, roster] = await Promise.all([
      db.enrollment.findMany({
        where: {
          centerId: group.centerId,
          status: "active",
          ...(narrowTo ? { studentId: narrowTo } : {}),
        },
        select: { studentId: true },
        take: narrowTo ? 1 : ROSTER_CAP,
      }),
      db.centerStudentRoster.findMany({
        where: {
          centerId: group.centerId,
          leftAt: null,
          ...(narrowTo ? { studentId: narrowTo } : {}),
        },
        select: { studentId: true },
        take: narrowTo ? 1 : ROSTER_CAP,
      }),
    ]);
    return [
      ...new Set([...enrolled.map((e) => e.studentId), ...roster.map((r) => r.studentId)]),
    ];
  }

  // course + session both derive from the course's ACTIVE enrollments. A
  // session channel is a narrower label on the same roster — a student pays
  // per course/subscription, so session membership follows the enrollment.
  if (!group.courseId) return [];
  const rows = await db.enrollment.findMany({
    where: {
      courseId: group.courseId,
      status: "active",
      ...(narrowTo ? { studentId: narrowTo } : {}),
    },
    select: { studentId: true },
    take: narrowTo ? 1 : ROSTER_CAP,
  });
  return [...new Set(rows.map((r) => r.studentId))];
}

/** Approved parents of the group's students. */
async function derivedParentIds(
  db: TenantTx,
  studentIds: string[],
  narrowTo?: string,
): Promise<string[]> {
  if (!studentIds.length) return [];
  const rows = await db.parentStudentLink.findMany({
    where: {
      studentId: { in: studentIds },
      status: "approved",
      ...(narrowTo ? { parentId: narrowTo } : {}),
    },
    select: { parentId: true },
    take: narrowTo ? 1 : ROSTER_CAP,
  });
  return [...new Set(rows.map((r) => r.parentId))];
}

async function groupTeacherId(
  db: TenantTx,
  group: Pick<ConversationGroup, "courseId">,
): Promise<string | null> {
  if (!group.courseId) return null;
  const course = await db.course.findUnique({
    where: { id: group.courseId },
    select: { teacherId: true },
  });
  return course?.teacherId ?? null;
}

/**
 * FULL membership — used to refresh the cache and to show member counts.
 * Bounded by ROSTER_CAP; the gate never calls this (it narrows instead).
 */
export async function deriveMembers(
  db: TenantTx,
  group: ConversationGroup,
): Promise<DerivedSide[]> {
  const teacherId = await groupTeacherId(db, group);
  const centerId =
    group.centerId ??
    (group.courseId
      ? (await db.course.findUnique({
          where: { id: group.courseId },
          select: { centerId: true },
        }))?.centerId ?? null
      : null);

  const studentIds = await derivedStudentIds(db, group);
  const [parents, teaching] = await Promise.all([
    derivedParentIds(db, studentIds),
    teachingSide(db, { teacherId, centerId }),
  ]);

  const byId = new Map<string, DerivedSide>();
  for (const s of studentIds) byId.set(s, { userId: s, role: "student" });
  for (const p of parents) if (!byId.has(p)) byId.set(p, { userId: p, role: "parent" });
  for (const t of teaching) byId.set(t.userId, t); // teaching side wins the role
  byId.set(group.ownerId, byId.get(group.ownerId) ?? { userId: group.ownerId, role: "teacher" });
  return [...byId.values()];
}

// ---------------------------------------------------------------------------
// THE GROUP GATE — live, narrowed to one user.
// ---------------------------------------------------------------------------

export type GroupAccess = {
  group: ConversationGroup;
  role: Role;
  /** Owner or a delegate of the owning principal (teacher's assistant, center staff). */
  isOwnerSide: boolean;
  canPost: boolean;
  canManage: boolean;
};

export async function assertGroupAccess(
  db: TenantTx,
  actor: ChatActor,
  groupId: string,
  action: GroupAction,
): Promise<GroupAccess> {
  const group = await db.conversationGroup.findUnique({ where: { id: groupId } });
  if (!group) throw new ChatError("group_not_found");

  const teacherId = await groupTeacherId(db, group);
  const centerId =
    group.centerId ??
    (group.courseId
      ? (await db.course.findUnique({
          where: { id: group.courseId },
          select: { centerId: true },
        }))?.centerId ?? null
      : null);

  // --- owner side (may post under owner_only, and may manage) --------------
  const teaching = await teachingSide(db, { teacherId, centerId }, actor.id);
  const asTeaching = teaching.find((t) => t.userId === actor.id);
  const isOwner = group.ownerId === actor.id;
  const isOwnerSide = isOwner || !!asTeaching;

  // --- audience side (read; post only when postPolicy = members) -----------
  let role: Role | null = asTeaching?.role ?? (isOwner ? actor.role : null);
  if (!role) {
    if (actor.role === "student") {
      const hit = await derivedStudentIds(db, group, actor.id);
      if (hit.includes(actor.id)) role = "student";
    } else if (actor.role === "parent") {
      // A parent belongs iff one of their APPROVED children is in the roster.
      const students = await derivedStudentIds(db, group);
      const parents = await derivedParentIds(db, students, actor.id);
      if (parents.includes(actor.id)) role = "parent";
    }
  }

  if (!role) {
    // Default-deny: no derived relationship of any kind.
    throw new ChatError("not_participant", "You are not a member of this group");
  }

  const canManage = isOwnerSide;
  // GATE 3 (child safety) also applies here. Every group is built around the
  // teaching side — the course teacher, their assistants, the center's admins
  // and staff — so a group post BY a student is adult-facing by construction.
  // A minor with no guardian email may still READ (announcements are part of
  // the class they paid for); they may not WRITE into an adult audience.
  const guardianLocked =
    role === "student" && (await isGuardianChannelLocked(db, actor.id));
  const canPost =
    !group.archivedAt &&
    !guardianLocked &&
    (isOwnerSide || group.postPolicy === "members");

  if (action === "post" && !canPost) {
    if (guardianLocked) throw new ChatError("guardian_required", GUARDIAN_LOCK_MESSAGE);
    throw new ChatError(
      "policy_denied",
      group.archivedAt
        ? "This channel is archived"
        : "Only the teacher and their team can post in this channel",
    );
  }
  if (action === "manage" && !canManage) {
    throw new ChatError("policy_denied", "You cannot manage this channel");
  }

  return { group, role, isOwnerSide, canPost, canManage };
}

// ---------------------------------------------------------------------------
// Cache refresh
// ---------------------------------------------------------------------------

/**
 * Recompute `group_members` from the live relations. Idempotent: users who
 * left are soft-marked (leftAt) rather than deleted so their unread state and
 * history position survive a re-join.
 */
export async function syncGroupMembers(
  db: TenantTx,
  groupId: string,
): Promise<{ added: number; removed: number; total: number }> {
  const group = await db.conversationGroup.findUnique({ where: { id: groupId } });
  if (!group) throw new ChatError("group_not_found");

  const derived = await deriveMembers(db, group);
  const derivedIds = new Set(derived.map((d) => d.userId));

  const existing = await db.groupMember.findMany({
    where: { groupId },
    select: { id: true, userId: true, leftAt: true },
  });
  const existingById = new Map(existing.map((e) => [e.userId, e]));

  let added = 0;
  for (const d of derived) {
    const row = existingById.get(d.userId);
    if (!row) {
      await db.groupMember.create({
        data: { groupId, userId: d.userId, role: d.role },
      });
      added++;
    } else if (row.leftAt) {
      await db.groupMember.update({
        where: { id: row.id },
        data: { leftAt: null, role: d.role },
      });
      added++;
    }
  }

  const stale = existing.filter((e) => !derivedIds.has(e.userId) && !e.leftAt);
  if (stale.length) {
    await db.groupMember.updateMany({
      where: { id: { in: stale.map((s) => s.id) } },
      data: { leftAt: new Date() },
    });
  }

  return { added, removed: stale.length, total: derivedIds.size };
}

// ---------------------------------------------------------------------------
// Create / list / read / post
// ---------------------------------------------------------------------------

export type CreateGroupInput = {
  kind: GroupKind;
  courseId?: string;
  sessionId?: string;
  centerId?: string;
  title?: string;
  postPolicy?: "owner_only" | "members";
  isDemo?: boolean;
};

/**
 * Who may create a channel: the course's teacher, that teacher's active
 * assistant, or the owning center's admin / manager staff. Students and
 * parents never can. Verified against the SAME derivation the gate uses.
 */
export async function createGroup(
  db: TenantTx,
  actor: ChatActor,
  input: CreateGroupInput,
): Promise<ConversationGroup> {
  let courseId: string | null = input.courseId ?? null;
  let centerId: string | null = input.centerId ?? null;
  let sessionId: string | null = null;
  let title = input.title ?? "";

  if (input.kind === "session") {
    if (!input.sessionId) throw new ChatError("invalid_body", "sessionId is required");
    const session = await db.session.findUnique({
      where: { id: input.sessionId },
      select: { id: true, courseId: true, date: true, course: { select: { title: true } } },
    });
    if (!session) throw new ChatError("group_not_found", "Session not found");
    sessionId = session.id;
    courseId = session.courseId;
    title ||= `${session.course.title} — ${session.date.toISOString().slice(0, 10)}`;
  } else if (input.kind === "course") {
    if (!courseId) throw new ChatError("invalid_body", "courseId is required");
  } else {
    if (!centerId) throw new ChatError("invalid_body", "centerId is required");
  }

  let ownerId = actor.id;
  if (courseId) {
    const course = await db.course.findUnique({
      where: { id: courseId },
      select: { id: true, title: true, teacherId: true, centerId: true },
    });
    if (!course) throw new ChatError("group_not_found", "Course not found");
    ownerId = course.teacherId;
    centerId = course.centerId;
    title ||= course.title;

    const allowed = await teachingSide(
      db,
      { teacherId: course.teacherId, centerId: course.centerId },
      actor.id,
    );
    // Center staff may only create through the manager tier.
    const staffOk =
      actor.role !== "center_staff" ||
      !!(await db.centerStaff.findFirst({
        where: {
          staffUserId: actor.id,
          removedAt: null,
          centerId: course.centerId ?? undefined,
          role: "manager",
        },
        select: { id: true },
      }));
    if (!allowed.some((a) => a.userId === actor.id) || !staffOk) {
      throw new ChatError("policy_denied", "You cannot create a channel for this course");
    }
  } else if (centerId) {
    const admin = await db.centerAdminProfile.findFirst({
      where: { userId: actor.id, centerId },
      select: { userId: true },
    });
    const manager = await db.centerStaff.findFirst({
      where: { staffUserId: actor.id, centerId, removedAt: null, role: "manager" },
      select: { id: true },
    });
    if (!admin && !manager) {
      throw new ChatError("policy_denied", "You cannot create a channel for this center");
    }
    ownerId = admin?.userId ?? actor.id;
    if (!title) {
      const c = await db.center.findUnique({
        where: { id: centerId },
        select: { name: true },
      });
      title = c?.name ?? "Center announcements";
    }
  }

  const group = await db.conversationGroup.create({
    data: {
      kind: input.kind,
      courseId,
      sessionId,
      centerId,
      ownerId,
      title: title.slice(0, 200),
      postPolicy: input.postPolicy ?? "owner_only",
      isDemo: input.isDemo ?? false,
    },
  });
  await syncGroupMembers(db, group.id);
  return group;
}

export async function listGroupsForUser(
  db: TenantTx,
  actor: ChatActor,
  opts: { limit?: number } = {},
): Promise<GroupView[]> {
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 100);
  const memberships = await db.groupMember.findMany({
    where: { userId: actor.id, leftAt: null },
    orderBy: { group: { lastMessageAt: "desc" } },
    take: limit,
    include: { group: true },
  });

  const counts = await db.groupMember.groupBy({
    by: ["groupId"],
    where: { groupId: { in: memberships.map((m) => m.groupId) }, leftAt: null },
    _count: { _all: true },
  });
  const countBy = new Map(counts.map((c) => [c.groupId, c._count._all]));

  const views: GroupView[] = [];
  for (const m of memberships) {
    const g = m.group;
    if (g.archivedAt) continue;
    // The cached row got them into the list; the LIVE gate decides whether
    // they may actually post. Read access is re-verified on open.
    let canPost = false;
    try {
      canPost = (await assertGroupAccess(db, actor, g.id, "read")).canPost;
    } catch {
      continue; // membership went stale — hide it rather than show a dead row
    }
    views.push({
      id: g.id,
      kind: g.kind,
      title: g.title,
      courseId: g.courseId,
      sessionId: g.sessionId,
      centerId: g.centerId,
      ownerId: g.ownerId,
      postPolicy: g.postPolicy,
      memberCount: countBy.get(g.id) ?? 0,
      lastMessageAt: g.lastMessageAt,
      lastMessagePreview: g.lastMessagePreview,
      lastMessageSenderId: g.lastMessageSenderId,
      unreadCount: m.unreadCount,
      canPost,
      muted: m.muted,
    });
  }
  return views;
}

export async function listGroupMessages(
  db: TenantTx,
  actor: ChatActor,
  groupId: string,
  opts: { beforeSeq?: number; limit?: number } = {},
): Promise<{ messages: GroupMessageView[]; hasMore: boolean }> {
  await assertGroupAccess(db, actor, groupId, "read");
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 100);
  const rows = await db.groupMessage.findMany({
    where: {
      groupId,
      ...(opts.beforeSeq != null ? { seq: { lt: BigInt(opts.beforeSeq) } } : {}),
    },
    orderBy: { seq: "desc" },
    take: limit + 1,
  });
  const hasMore = rows.length > limit;
  return {
    messages: rows.slice(0, limit).reverse().map(toGroupMessageView),
    hasMore,
  };
}

export async function postGroupMessage(
  db: TenantTx,
  actor: ChatActor,
  groupId: string,
  input: { body: string; clientId?: string },
  opts: { limiter: ChatLimiter },
): Promise<{ message: GroupMessageView; recipientIds: string[]; duplicate: boolean }> {
  const body = input.body?.trim();
  if (!body) throw new ChatError("invalid_body", "Message cannot be empty");
  if (body.length > MAX_MESSAGE_LENGTH) {
    throw new ChatError("invalid_body", `Message exceeds ${MAX_MESSAGE_LENGTH} characters`);
  }

  // Live gate BEFORE the limiter so a non-member's probe is denied outright.
  await assertGroupAccess(db, actor, groupId, "post");
  await consume(
    opts.limiter,
    `chat:group-send:${groupId}:${actor.id}`,
    RATE_LIMITS.groupSend,
    "You are posting too quickly, please slow down.",
  );

  if (input.clientId) {
    const dup = await db.groupMessage.findUnique({
      where: { groupId_clientId: { groupId, clientId: input.clientId } },
    });
    if (dup) {
      return {
        message: toGroupMessageView(dup),
        recipientIds: [],
        duplicate: true,
      };
    }
  }

  const created = await db.groupMessage.create({
    data: { groupId, senderId: actor.id, body, clientId: input.clientId ?? null },
  });

  await db.conversationGroup.update({
    where: { id: groupId },
    data: {
      lastMessageAt: created.createdAt,
      lastMessagePreview: body.slice(0, PREVIEW_LENGTH),
      lastMessageSenderId: actor.id,
    },
  });
  await db.groupMember.updateMany({
    where: { groupId, leftAt: null, userId: { not: actor.id } },
    data: { unreadCount: { increment: 1 } },
  });

  const recipients = await db.groupMember.findMany({
    where: { groupId, leftAt: null, userId: { not: actor.id }, muted: false },
    select: { userId: true },
    take: ROSTER_CAP,
  });

  return {
    message: toGroupMessageView(created),
    recipientIds: recipients.map((r) => r.userId),
    duplicate: false,
  };
}

export async function markGroupRead(
  db: TenantTx,
  actor: ChatActor,
  groupId: string,
): Promise<{ groupId: string; readAt: Date }> {
  await assertGroupAccess(db, actor, groupId, "read");
  const now = new Date();
  await db.groupMember.updateMany({
    where: { groupId, userId: actor.id },
    data: { unreadCount: 0, lastReadAt: now },
  });
  return { groupId, readAt: now };
}

export async function setGroupMuted(
  db: TenantTx,
  actor: ChatActor,
  groupId: string,
  muted: boolean,
): Promise<{ groupId: string; muted: boolean }> {
  await assertGroupAccess(db, actor, groupId, "read");
  await db.groupMember.updateMany({
    where: { groupId, userId: actor.id },
    data: { muted },
  });
  return { groupId, muted };
}
