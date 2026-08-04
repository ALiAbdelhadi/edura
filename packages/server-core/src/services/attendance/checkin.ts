import { platformDb, type TenantTx } from "../../db/scope";
import {
  BusinessRuleError,
  ForbiddenError,
  NotFoundError,
} from "../../errors/classes";
import type { SessionUser } from "../../auth/types";
import { notify } from "../../services/notifications/notify";
import { coveredStudentIds } from "../../services/subscriptions/coverage";
import { resolveStudentCode } from "@repo/database/student-code";
import { Prisma } from "@repo/database";
import { maskName, maskPhone } from "../students/disclosure";

// ---------------------------------------------------------------------------
// Step 6 — counter + door check-in.
// Stages (counterAt/doorAt) are FACTS; `status` is the single derived truth:
//   mode counter_only:      counter            -> present
//   mode counter_and_door:  counter, no door   -> counter_only (NOT present)
//                           counter + door     -> present
// Door STRICTLY requires counter first (approved decision).
// ---------------------------------------------------------------------------

function dayBounds(date = new Date()): { start: Date; end: Date } {
  const start = new Date(date);
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start, end };
}

// Step 8: the assistant->teacher resolution moved to the single delegation
// helper; kept as an alias so Step 6 call sites stay unchanged.
import { resolveActingTeacher } from "../../authz/acting-teacher";
export const resolveAssistantTeacher = resolveActingTeacher;

// ---------------------------------------------------------------------------
// Counter: lookup + suggest + check-in (center front desk)
// ---------------------------------------------------------------------------

/**
 * Is what was typed a PHONE NUMBER, rather than a fragment that happens to
 * contain digits? Any letter disqualifies it, and it must carry enough digits
 * to be the number itself — a person reads their whole number out at a counter,
 * they do not read out three digits of it.
 *
 * The threshold is 8 rather than Egypt's full 11 so that a number typed without
 * its leading zero, or a landline, still resolves. Below that it is not an
 * identifier, it is a prefix, and a prefix is how you enumerate.
 */
const PHONE_IDENTIFIER_MIN_DIGITS = 8;

function asPhoneIdentifier(query: string): string | null {
  if (/[^\d\s+()\-]/.test(query)) return null;
  const digits = query.replace(/\D/g, "");
  return digits.length >= PHONE_IDENTIFIER_MIN_DIGITS ? digits : null;
}

/**
 * The counter search — "who is standing in front of me?"
 *
 * ── REACHING A STUDENT AND READING ONE ARE DIFFERENT PERMISSIONS ────────────
 *
 * This lookup runs under `platformDb`, deliberately: a walk-in carrying another
 * center's card must resolve, which is the whole reason the result carries
 * `onOurRoster` and `otherCenters` for the UI to warn about. But the query used
 * to OR the student code together with `contains` matches on name and phone,
 * all of them platform-wide, and return every hit's phone number. Two typed
 * characters therefore listed children from every center on the platform with
 * their numbers attached — to `RECEPTION`, the least privileged center role.
 *
 * So the reach is split by what the query actually proves:
 *
 *   IDENTIFIER  — a student code whose check character agrees, or a phone
 *                 number given in full. Both are things the person at the desk
 *                 supplied; supplying one is evidence you are dealing with that
 *                 child. These reach the whole platform.
 *
 *   FREE TEXT   — a name, or a short run of digits. Evidence of nothing:
 *                 "محمد" matches thousands. This searches THIS CENTER'S ROSTER
 *                 and nothing else.
 *
 * ── AND THE DISCLOSURE IS THEN TIERED ──────────────────────────────────────
 *
 * The same tiering `lookupStudentForManualEntry` already applies, from the same
 * `maskName`/`maskPhone`: our own student comes back in full, because the center
 * holds that data already; a student reached by identifier but not held by this
 * center comes back with a masked name and a last-4 phone. The receptionist
 * scanning a card can already read the full name off the card in their hand, so
 * masking costs them nothing and stops the response being a directory entry.
 *
 * `studentId` IS still returned for that student — unlike the manual-entry
 * lookup, this one has to be able to check them in.
 */
export async function lookupStudents(q: string, admin: SessionUser) {
  const centerId = admin.centerId as string;
  const query = q.trim();
  if (query.length < 2) return [];

  // A code only becomes a search term once its check character agrees. So a
  // card scanned with one character misread contributes NOTHING to the OR
  // instead of matching a different student outright — the receptionist gets
  // "not found" and looks again, which is the honest answer.
  const code = resolveStudentCode(query);
  const phone = asPhoneIdentifier(query);

  return platformDb(async (tx) => {
    // Read once: it bounds the free-text search AND decides, below, how much of
    // each row may be disclosed.
    const ourRoster = await tx.centerStudentRoster.findMany({
      where: { centerId, leftAt: null },
      select: { studentId: true },
    });
    const ourStudentIds = ourRoster.map((r) => r.studentId);

    const reach: Prisma.StudentProfileWhereInput[] = [
      ...(code ? [{ studentCode: code }] : []),
      ...(phone
        ? [
            { phone: { contains: phone } },
            { user: { phone: { contains: phone } } },
          ]
        : []),
      ...(ourStudentIds.length
        ? [
            {
              userId: { in: ourStudentIds },
              OR: [
                { phone: { contains: query } },
                { fullName: { contains: query, mode: "insensitive" as const } },
                { user: { name: { contains: query, mode: "insensitive" as const } } },
                { user: { phone: { contains: query } } },
              ],
            },
          ]
        : []),
    ];

    // No identifier and an empty roster: there is nothing this center may
    // legitimately match on, and an empty `OR` in Prisma matches EVERY row.
    if (reach.length === 0) return [];

    const profiles = await tx.studentProfile.findMany({
      where: {
        OR: reach,
        user: { status: { in: ["active", "shell"] } },
      },
      select: {
        userId: true,
        fullName: true,
        studentCode: true,
        phone: true,
        user: { select: { name: true, phone: true, status: true } },
      },
      take: 10,
    });

    const userIds = profiles.map((p) => p.userId).filter(Boolean) as string[];
    const rosters = await tx.centerStudentRoster.findMany({
      where: { studentId: { in: userIds }, leftAt: null },
      select: { studentId: true, centerId: true },
    });
    const centerNames = new Map(
      (
        await tx.center.findMany({
          where: { id: { in: [...new Set(rosters.map((r) => r.centerId))] } },
          select: { id: true, name: true },
        })
      ).map((c) => [c.id, c.name]),
    );

    return profiles
      .filter((p) => p.userId)
      .map((p) => {
        const mine = rosters.filter((r) => r.studentId === p.userId);
        const onOurRoster = mine.some((r) => r.centerId === centerId);
        const name = p.user?.name ?? p.fullName;
        const contact = p.user?.phone ?? p.phone;
        return {
          studentId: p.userId as string,
          name: onOurRoster ? name : maskName(name),
          // Echoed back only when it is the code they searched with — that
          // discloses nothing they did not already hold in their hand. Reached
          // by phone instead, the code would be new information about a child
          // this center does not have.
          studentCode:
            onOurRoster || (code !== null && code === p.studentCode)
              ? p.studentCode
              : null,
          phone: onOurRoster ? contact : maskPhone(contact),
          isShell: p.user?.status === "shell",
          onOurRoster,
          otherCenters: mine
            .filter((r) => r.centerId !== centerId)
            .map((r) => centerNames.get(r.centerId) ?? "?"),
        };
      });
  });
}

/**
 * Both selection paths (approved decision B): `suggested` = today's sessions
 * at this center the student holds coverage for; `today` = every session at
 * this center today for manual pick.
 */
export async function suggestSessions(studentId: string, admin: SessionUser) {
  const centerId = admin.centerId as string;
  const { start, end } = dayBounds();

  return platformDb(async (tx) => {
    const sessions = await tx.session.findMany({
      where: {
        date: { gte: start, lt: end },
        status: "scheduled",
        course: { centerId },
      },
      select: {
        id: true,
        courseId: true,
        date: true,
        startTime: true,
        endTime: true,
        teacherId: true,
      },
      orderBy: { startTime: "asc" },
    });
    if (sessions.length === 0) return { suggested: [], today: [] };

    const courses = await tx.course.findMany({
      where: { id: { in: [...new Set(sessions.map((s) => s.courseId))] } },
      select: { id: true, title: true, pricePerSession: true },
    });
    const courseMap = new Map(courses.map((c) => [c.id, c]));

    const enriched = [] as {
      sessionId: string;
      courseId: string;
      courseTitle: string;
      startTime: string;
      endTime: string;
      covered: boolean;
      pricePerSession: number | null;
    }[];
    for (const s of sessions) {
      const covered = await coveredStudentIds(
        tx,
        { id: s.id, courseId: s.courseId, date: s.date },
        [studentId],
      );
      enriched.push({
        sessionId: s.id,
        courseId: s.courseId,
        courseTitle: courseMap.get(s.courseId)?.title ?? "—",
        startTime: s.startTime,
        endTime: s.endTime,
        covered: covered.has(studentId),
        pricePerSession: courseMap.get(s.courseId)?.pricePerSession ?? null,
      });
    }
    return {
      suggested: enriched.filter((e) => e.covered),
      today: enriched,
    };
  });
}

export type CounterResult = {
  status: "present" | "counter_only";
  mode: "counter_only" | "counter_and_door";
  needsDoorCheckin: boolean;
};

export async function counterCheckin(
  input: { studentId: string; sessionId: string },
  admin: SessionUser,
): Promise<CounterResult> {
  const centerId = admin.centerId as string;

  const { result, crossCenterNotify } = await platformDb(
    async (tx) => {
      const session = await tx.session.findUnique({
        where: { id: input.sessionId },
        select: { id: true, courseId: true, teacherId: true, date: true, status: true },
      });
      if (!session) throw new NotFoundError("Session not found");
      if (session.status === "cancelled") {
        throw new BusinessRuleError("Session is cancelled");
      }
      const course = await tx.course.findUnique({
        where: { id: session.courseId },
        select: { centerId: true, pricePerSession: true, title: true, dataSource: true },
      });
      if (!course || course.centerId !== centerId) {
        throw new ForbiddenError("Session is not at your center");
      }

      // Coverage gate — the ONLY payment integration point. Payment itself is
      // the Step 4 walk-in per-session path; no money code lives here.
      const covered = await coveredStudentIds(
        tx,
        { id: session.id, courseId: session.courseId, date: session.date },
        [input.studentId],
      );
      if (!covered.has(input.studentId)) {
        throw new BusinessRuleError("Student has no coverage for this session", {
          code: "needs_payment",
          pricePerSession: course.pricePerSession,
          courseTitle: course.title,
        });
      }

      const teacherProfile = await tx.teacherProfile.findUnique({
        where: { userId: session.teacherId },
        select: { attendanceMode: true },
      });
      const mode = teacherProfile?.attendanceMode ?? "counter_only";

      const now = new Date();
      const existing = await tx.attendanceRecord.findUnique({
        where: {
          sessionId_studentId: { sessionId: session.id, studentId: input.studentId },
        },
      });

      // Derived status: door already done (out-of-order but possible after a
      // mode flip) keeps present; otherwise per the mode table.
      const derived =
        mode === "counter_only" || existing?.doorAt ? "present" : "counter_only";

      if (existing) {
        await tx.attendanceRecord.update({
          where: { id: existing.id },
          data: {
            status: derived,
            counterAt: existing.counterAt ?? now,
            counterBy: existing.counterBy ?? admin.id,
            markedBy: admin.id,
            editedAt: now,
          },
        });
      } else {
        await tx.attendanceRecord.create({
          data: {
            sessionId: session.id,
            studentId: input.studentId,
            courseId: session.courseId,
            centerId,
            status: derived,
            markedBy: admin.id,
            counterAt: now,
            counterBy: admin.id,
            // Inherited from the group (see bulkMarkAttendance) — the counter
            // works identically for an off-system teacher's lesson.
            dataSource: course.dataSource,
          },
        });
      }

      // Cross-center recognition: active roster rows at OTHER centers → let
      // the student choose (keep or switch) via me/roster/choice.
      const rosters = await tx.centerStudentRoster.findMany({
        where: { studentId: input.studentId, leftAt: null },
        select: { centerId: true },
      });
      const others = rosters.filter((r) => r.centerId !== centerId);
      const names = new Map(
        (
          await tx.center.findMany({
            where: { id: { in: rosters.map((r) => r.centerId) } },
            select: { id: true, name: true },
          })
        ).map((c) => [c.id, c.name]),
      );

      return {
        result: {
          status: derived,
          mode,
          needsDoorCheckin: derived === "counter_only",
        } as CounterResult,
        crossCenterNotify:
          others.length > 0
            ? {
                studentId: input.studentId,
                newCenterId: centerId,
                newCenterName: names.get(centerId) ?? "this center",
                otherNames: others.map((o) => names.get(o.centerId) ?? "?"),
              }
            : null,
      };
    },
    { actorId: admin.id },
  );

  if (crossCenterNotify) {
    await notify({
      recipients: [crossCenterNotify.studentId],
      type: "student_added_to_roster",
      title: "Choose your center",
      body: `You attended at ${crossCenterNotify.newCenterName} but are also registered at ${crossCenterNotify.otherNames.join(", ")}. Keep your current center or switch — open the app to choose.`,
      data: {
        action: "center_choice",
        newCenterId: crossCenterNotify.newCenterId,
      },
    });
  }

  return result;
}

// ---------------------------------------------------------------------------
// Door: assistant (teacher fallback) — strictly after counter
// ---------------------------------------------------------------------------

export type DoorOutcome = "present" | "already_present" | "no_counter" | "error";

/** Shared transition, used by the door route AND the offline sync path. */
export async function doorTransitionTx(
  tx: TenantTx,
  input: { studentId: string; sessionId: string; actorId: string; teacherId: string; at?: Date },
): Promise<{ outcome: DoorOutcome; reason?: string }> {
  const session = await tx.session.findUnique({
    where: { id: input.sessionId },
    select: { teacherId: true },
  });
  if (!session) return { outcome: "error", reason: "session_not_found" };
  if (session.teacherId !== input.teacherId) {
    return { outcome: "error", reason: "not_your_session" };
  }

  const record = await tx.attendanceRecord.findUnique({
    where: {
      sessionId_studentId: { sessionId: input.sessionId, studentId: input.studentId },
    },
  });
  if (!record || !record.counterAt) {
    // STRICT: the door confirms a student the counter already admitted.
    return { outcome: "no_counter", reason: "no_counter_checkin" };
  }
  if (record.doorAt) {
    // Idempotent replay: nothing to change, nothing overwritten.
    return { outcome: "already_present" };
  }

  await tx.attendanceRecord.update({
    where: { id: record.id },
    data: {
      status: "present",
      doorAt: input.at ?? new Date(),
      doorBy: input.actorId,
      markedBy: input.actorId,
      editedAt: new Date(),
    },
  });
  return { outcome: "present" };
}

export async function doorCheckin(
  input: { studentId?: string; studentCode?: string; sessionId: string },
  user: SessionUser,
) {
  return platformDb(
    async (tx) => {
      const teacherId = await resolveAssistantTeacher(tx, user);

      let studentId = input.studentId;
      if (!studentId && input.studentCode) {
        // The check character earns its keep here: a code typed one character
        // wrong at the hall door must FAIL, not resolve to another child and
        // mark them present. `resolveStudentCode` returns null for anything
        // that is not a genuine code, so the lookup never runs on a guess.
        const code = resolveStudentCode(input.studentCode);
        if (!code) throw new NotFoundError("Student code not found");
        const profile = await tx.studentProfile.findFirst({
          where: { studentCode: code },
          select: { userId: true },
        });
        if (!profile?.userId) throw new NotFoundError("Student code not found");
        studentId = profile.userId;
      }
      if (!studentId) throw new BusinessRuleError("studentId or studentCode is required");

      const res = await doorTransitionTx(tx, {
        studentId,
        sessionId: input.sessionId,
        actorId: user.id,
        teacherId,
      });
      if (res.outcome === "no_counter") {
        throw new BusinessRuleError(
          "Student has not been checked in at the counter — door check-in requires the counter first",
        );
      }
      if (res.outcome === "error") {
        throw new BusinessRuleError(res.reason ?? "Door check-in failed");
      }
      return { studentId, sessionId: input.sessionId, result: res.outcome };
    },
    { actorId: user.id },
  );
}

/** Door roster view: who passed the counter and who is door-confirmed. */
export async function doorSessionState(sessionId: string, user: SessionUser) {
  return platformDb(async (tx) => {
    const teacherId = await resolveAssistantTeacher(tx, user);
    const session = await tx.session.findUnique({
      where: { id: sessionId },
      select: { id: true, teacherId: true, courseId: true },
    });
    if (!session) throw new NotFoundError("Session not found");
    if (session.teacherId !== teacherId) throw new ForbiddenError("Not your session");

    const records = await tx.attendanceRecord.findMany({
      where: { sessionId },
      select: {
        studentId: true,
        status: true,
        counterAt: true,
        doorAt: true,
      },
    });
    const ids = records.map((r) => r.studentId);
    const profiles = await tx.studentProfile.findMany({
      where: { userId: { in: ids } },
      select: { userId: true, studentCode: true, fullName: true, user: { select: { name: true } } },
    });
    const pMap = new Map(profiles.map((p) => [p.userId, p]));
    return records.map((r) => ({
      ...r,
      name: pMap.get(r.studentId)?.user?.name ?? pMap.get(r.studentId)?.fullName ?? "—",
      studentCode: pMap.get(r.studentId)?.studentCode ?? null,
    }));
  });
}
