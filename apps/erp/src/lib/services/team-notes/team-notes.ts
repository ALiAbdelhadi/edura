import type { SessionUser } from "@/lib/auth/session";
import { scopedDb, platformDb } from "@/lib/db/scope";
import { ForbiddenError, NotFoundError } from "@/lib/errors/classes";
import { notify } from "@/lib/services/notifications/notify";
import {
  resolveCenterTeamPeers,
  resolveTeacherTeamPeers,
} from "@/lib/services/notifications/fanout";
import type { CenterStaffRole, TeamNoteStatus } from "@repo/database";

/**
 * Team notes — an internal TO-DO board for exactly ONE team:
 *   * center board  (centerId):  owner/co-owners + active center_staff
 *   * teacher board (teacherId): teacher + active assistants
 *
 * Membership IS the route gate: every caller arrives through
 * `delegatedWithCenter` / the center-actor, whose live-link resolution already
 * proved they belong to this exact team — so the service derives the board
 * from `acting` and never re-checks membership.
 *
 * Rules (approved 2026-07-27):
 *   - Everyone on the team reads the board; listing it IS the read receipt
 *     (upserted per note, so "who has seen this" is visible to the whole team).
 *     Recording the receipt on GET is deliberate: center_accountant is
 *     read-only (mutating methods 403), yet their reads must still register.
 *   - Authors write as THEMSELVES (caller id), never on-behalf-of.
 *   - Any team member may flip a note's status (open/done/declined) — that is
 *     the to-do point. The author is notified when someone else flips theirs.
 *   - Body edits: author only. Pin + delete: author or a team LEAD
 *     (center owner / manager, or the teacher side, where Step 8 delegation
 *     makes the assistant act with the teacher's full non-money powers).
 *   - Soft-delete only (deletedAt), per the platform convention.
 */

export type TeamNoteActor = {
  acting: SessionUser;
  caller: SessionUser;
  actorId: string;
  onBehalfOf: string | null;
  /** Present only on the center path (CenterActor); undefined on teacher path. */
  staffRole?: CenterStaffRole | null;
};

type BoardScope =
  | { kind: "center"; centerId: string }
  | { kind: "teacher"; teacherId: string };

function boardScope(acting: SessionUser): BoardScope {
  if (acting.role === "center_admin") {
    if (!acting.centerId) throw new ForbiddenError("Center actor has no center");
    return { kind: "center", centerId: acting.centerId };
  }
  // Teacher path: acting is always teacher-shaped (assistants are resolved to
  // their teacher by requireTeacherActor), so acting.id IS the board key.
  return { kind: "teacher", teacherId: acting.id };
}

function scopeWhere(scope: BoardScope) {
  return scope.kind === "center"
    ? { centerId: scope.centerId, deletedAt: null }
    : { teacherId: scope.teacherId, deletedAt: null };
}

/** Owner/manager on the center side; teacher AND assistant on the teacher side
 *  (full Step 8 delegation). Receptionists are members, not leads. */
function isLead(actor: TeamNoteActor): boolean {
  if (actor.acting.role === "center_admin") {
    return actor.staffRole == null || actor.staffRole === "manager";
  }
  return true;
}

async function resolveTeamMemberIds(scope: BoardScope): Promise<string[]> {
  return scope.kind === "center"
    ? resolveCenterTeamPeers(scope.centerId)
    : resolveTeacherTeamPeers(scope.teacherId);
}

async function nameMap(userIds: string[]): Promise<Map<string, { name: string | null; role: string }>> {
  if (userIds.length === 0) return new Map();
  const users = await platformDb((tx) =>
    tx.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, name: true, role: true },
    }),
  );
  return new Map(users.map((u) => [u.id, { name: u.name, role: u.role }]));
}

const snippet = (body: string) =>
  body.length > 120 ? body.slice(0, 117) + "…" : body;

export async function listTeamNotes(actor: TeamNoteActor) {
  const scope = boardScope(actor.acting);
  const me = actor.caller.id;

  const notes = await scopedDb(actor.acting, (tx) =>
    tx.teamNote.findMany({
      where: scopeWhere(scope),
      include: { reads: { orderBy: { readAt: "asc" } } },
      orderBy: [{ pinned: "desc" }, { createdAt: "desc" }],
    }),
  );

  // Listing the board IS the read: upsert the caller's receipt on every note
  // they have not seen yet (idempotent; skipDuplicates absorbs races).
  const now = new Date();
  const unseen = notes
    .filter((n) => !n.reads.some((r) => r.userId === me))
    .map((n) => n.id);
  if (unseen.length > 0) {
    await scopedDb(actor.acting, (tx) =>
      tx.teamNoteRead.createMany({
        data: unseen.map((noteId) => ({ noteId, userId: me })),
        skipDuplicates: true,
      }),
    );
  }

  const memberIds = await resolveTeamMemberIds(scope);
  const everyone = new Set<string>(memberIds);
  for (const n of notes) {
    everyone.add(n.authorUserId);
    if (n.statusChangedById) everyone.add(n.statusChangedById);
    for (const r of n.reads) everyone.add(r.userId);
  }
  const names = await nameMap([...everyone]);
  const label = (id: string) => ({ id, name: names.get(id)?.name ?? null });

  return {
    board: scope.kind,
    me: {
      id: me,
      lead: isLead(actor),
      // center_accountant is read-only platform-wide; the center-actor method
      // gate enforces it — this flag just lets the UI hide the composer.
      canWrite: actor.staffRole !== "center_accountant",
    },
    members: memberIds.map((id) => ({
      ...label(id),
      role: names.get(id)?.role ?? null,
    })),
    notes: notes.map((n) => {
      const readBy = n.reads.map((r) => ({ ...label(r.userId), readAt: r.readAt }));
      // Reflect the receipt we just wrote without a refetch.
      if (unseen.includes(n.id)) readBy.push({ ...label(me), readAt: now });
      return {
        id: n.id,
        body: n.body,
        pinned: n.pinned,
        status: n.status,
        author: label(n.authorUserId),
        statusChangedBy: n.statusChangedById ? label(n.statusChangedById) : null,
        statusChangedAt: n.statusChangedAt,
        createdAt: n.createdAt,
        readBy,
      };
    }),
  };
}

export async function createTeamNote(
  actor: TeamNoteActor,
  input: { body: string },
) {
  const scope = boardScope(actor.acting);
  const me = actor.caller.id;

  const note = await scopedDb(actor.acting, (tx) =>
    tx.teamNote.create({
      data: {
        centerId: scope.kind === "center" ? scope.centerId : null,
        teacherId: scope.kind === "teacher" ? scope.teacherId : null,
        authorUserId: me,
        body: input.body,
      },
    }),
  );
  // The author has trivially read their own note.
  await scopedDb(actor.acting, (tx) =>
    tx.teamNoteRead.createMany({
      data: [{ noteId: note.id, userId: me }],
      skipDuplicates: true,
    }),
  );

  const peers =
    scope.kind === "center"
      ? await resolveCenterTeamPeers(scope.centerId, me)
      : await resolveTeacherTeamPeers(scope.teacherId, me);
  await notify({
    recipients: peers,
    type: "team_note_created",
    title: actor.caller.name
      ? `Team note from ${actor.caller.name}`
      : "New team note",
    body: snippet(input.body),
    data: { noteId: note.id },
  });

  return note;
}

export async function updateTeamNote(
  actor: TeamNoteActor,
  noteId: string,
  patch: { body?: string; pinned?: boolean; status?: TeamNoteStatus },
) {
  const scope = boardScope(actor.acting);
  const me = actor.caller.id;

  const note = await scopedDb(actor.acting, (tx) =>
    tx.teamNote.findFirst({ where: { id: noteId, ...scopeWhere(scope) } }),
  );
  if (!note) throw new NotFoundError("Note not found");

  const author = note.authorUserId === me;
  if (patch.body !== undefined && !author) {
    throw new ForbiddenError("Only the author can edit a note's text");
  }
  if (patch.pinned !== undefined && !author && !isLead(actor)) {
    throw new ForbiddenError("Only the author or a team lead can pin a note");
  }

  const statusChanged =
    patch.status !== undefined && patch.status !== note.status;
  const updated = await scopedDb(actor.acting, (tx) =>
    tx.teamNote.update({
      where: { id: note.id },
      data: {
        ...(patch.body !== undefined ? { body: patch.body } : {}),
        ...(patch.pinned !== undefined ? { pinned: patch.pinned } : {}),
        ...(statusChanged
          ? {
              status: patch.status,
              statusChangedById: me,
              statusChangedAt: new Date(),
            }
          : {}),
      },
    }),
  );

  // To-do semantics: tell the author when someone ELSE flips their note.
  if (statusChanged && note.authorUserId !== me) {
    const verb =
      patch.status === "done"
        ? "marked done"
        : patch.status === "declined"
          ? "declined"
          : "reopened";
    await notify({
      recipients: [note.authorUserId],
      type: "team_note_status_changed",
      title: actor.caller.name
        ? `${actor.caller.name} ${verb} your note`
        : `Your team note was ${verb}`,
      body: snippet(note.body),
      data: { noteId: note.id, status: patch.status ?? note.status },
    });
  }

  return updated;
}

export async function deleteTeamNote(actor: TeamNoteActor, noteId: string) {
  const scope = boardScope(actor.acting);
  const me = actor.caller.id;

  const note = await scopedDb(actor.acting, (tx) =>
    tx.teamNote.findFirst({ where: { id: noteId, ...scopeWhere(scope) } }),
  );
  if (!note) throw new NotFoundError("Note not found");
  if (note.authorUserId !== me && !isLead(actor)) {
    throw new ForbiddenError("Only the author or a team lead can remove a note");
  }

  return scopedDb(actor.acting, (tx) =>
    tx.teamNote.update({
      where: { id: note.id },
      data: { deletedAt: new Date() },
    }),
  );
}
