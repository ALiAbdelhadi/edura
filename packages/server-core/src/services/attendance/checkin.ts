import { platformDb, type TenantTx } from "../../db/scope";
import {
  BusinessRuleError,
  ForbiddenError,
  NotFoundError,
} from "../../errors/classes";
import type { SessionUser } from "../../auth/types";
import { notify } from "../../services/notifications/notify";
import { runEffects, type WithEffects, type DeferredEffect } from "../../db/effects";
import { coveredStudentIds } from "../../services/subscriptions/coverage";
import { lessonClosed, lockSessionRow } from "./lesson-lock";
import { readStudentScan } from "../students/student-qr";
import { Prisma } from "@repo/database";
import {
  matchesSearchTerms,
  normalizeIdentifier,
  normalizeSearchText,
  searchTerms,
  SEARCH_SCAN_LIMIT,
} from "@repo/database/search-text";
import { maskName, maskPhone } from "../students/disclosure";

function dayBounds(date = new Date()): { start: Date; end: Date } {
  const start = new Date(date);
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start, end };
}

import { resolveActingTeacher } from "../../authz/acting-teacher";
export const resolveAssistantTeacher = resolveActingTeacher;

const PHONE_IDENTIFIER_MIN_DIGITS = 8;

function asPhoneIdentifier(query: string): string | null {
  const normalized = normalizeSearchText(query);
  if (/[^\d\s+()\-]/.test(normalized)) return null;
  const digits = normalized.replace(/\D/g, "");
  return digits.length >= PHONE_IDENTIFIER_MIN_DIGITS ? digits : null;
}

export async function lookupStudents(q: string, admin: SessionUser) {
  const centerId = admin.centerId as string;
  const query = q.trim();
  if (query.length < 2) return [];

  let scan = readStudentScan(query);
  if (scan.kind === "unreadable") {
    const retyped = normalizeIdentifier(query);
    if (retyped && retyped !== query.toUpperCase()) scan = readStudentScan(retyped);
  }
  const code = scan.kind === "unreadable" ? null : scan.code;
  const phone = asPhoneIdentifier(query);

  return platformDb(async (tx) => {
    const ourRoster = await tx.centerStudentRoster.findMany({
      where: { centerId, leftAt: null },
      select: { studentId: true },
    });
    const ourStudentIds = ourRoster.map((r) => r.studentId);

    const terms = searchTerms(query);

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
              AND: terms.map((t) => ({
                OR: [
                  { searchText: { contains: t } },
                  { user: { searchText: { contains: t } } },
                ],
              })),
            },
          ]
        : []),
    ];

    if (reach.length === 0) return [];

    const candidates = await tx.studentProfile.findMany({
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
      take: SEARCH_SCAN_LIMIT,
    });

    const profiles = candidates
      .filter((r) => {
        const byIdentifier =
          (code !== null && r.studentCode === code) ||
          (phone !== null &&
            ((r.phone ?? "").includes(phone) ||
              (r.user?.phone ?? "").includes(phone)));
        return (
          byIdentifier ||
          matchesSearchTerms(
            [r.user?.name, r.fullName, r.phone, r.user?.phone],
            terms,
          )
        );
      })
      .slice(0, 10);

    const userIds = profiles.map((p) => p.userId).filter(Boolean) as string[];
    const rosters = await tx.centerStudentRoster.findMany({
      where: { studentId: { in: userIds }, leftAt: null },
      select: { studentId: true, centerId: true },
    });
    return profiles
      .filter((p) => p.userId)
      .map((p) => {
        const mine = rosters.filter((r) => r.studentId === p.userId);
        const onOurRoster = mine.some((r) => r.centerId === centerId);
        const name = p.user?.name ?? p.fullName;
        const contact = p.user?.phone ?? p.phone;
        return {
          // A child this centre does not hold is reported, not identified: the real
          // id is withheld, so a match here cannot be replayed against an endpoint
          // that takes a student id. The desk's own students keep theirs.
          studentId: onOurRoster ? (p.userId as string) : null,
          name: onOurRoster ? name : maskName(name),
          studentCode:
            onOurRoster || (code !== null && code === p.studentCode)
              ? p.studentCode
              : null,
          phone: onOurRoster ? contact : maskPhone(contact),
          isShell: p.user?.status === "shell",
          onOurRoster,
          // A count, never the names. Which other centres a child attends is
          // behavioural data about that child and the desk has no use for it.
          otherCenterCount: mine.filter((r) => r.centerId !== centerId).length,
        };
      });
  });
}

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

    const attendance = await tx.attendanceRecord.findMany({
      where: { studentId, sessionId: { in: sessions.map((s) => s.id) } },
      select: { sessionId: true, status: true },
    });
    const attendanceMap = new Map(attendance.map((a) => [a.sessionId, a.status]));

    const enriched = [] as {
      sessionId: string;
      courseId: string;
      courseTitle: string;
      startTime: string;
      endTime: string;
      covered: boolean;
      pricePerSession: number | null;
      checkinStatus: string | null;
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
        checkinStatus: attendanceMap.get(s.id) ?? null,
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
  const { value, effects } = await platformDb((tx) => counterCheckinTx(tx, input, admin), {
    actorId: admin.id,
  });
  await runEffects(effects);
  return value;
}

export async function counterCheckinTx(
  tx: TenantTx,
  input: { studentId: string; sessionId: string },
  admin: SessionUser,
): Promise<WithEffects<CounterResult>> {
  const centerId = admin.centerId as string;

  const { result, crossCenterNotify } = await (async () => {
    {
      await lockSessionRow(tx, input.sessionId);
      const session = await tx.session.findUnique({
        where: { id: input.sessionId },
        select: {
          id: true,
          courseId: true,
          teacherId: true,
          date: true,
          status: true,
          distributedAt: true,
        },
      });
      if (!session) throw new NotFoundError("Session not found");
      if (session.status === "cancelled") {
        throw new BusinessRuleError("Session is cancelled");
      }
      if (lessonClosed(session)) {
        throw new BusinessRuleError(
          "This lesson has ended — the counter register is closed",
          { code: "session_closed" },
        );
      }
      const course = await tx.course.findUnique({
        where: { id: session.courseId },
        select: { centerId: true, pricePerSession: true, title: true, dataSource: true },
      });
      if (!course || course.centerId !== centerId) {
        throw new ForbiddenError("Session is not at your center");
      }

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
            dataSource: course.dataSource,
          },
        });
      }

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
    }
  })();

  const effects: DeferredEffect[] = crossCenterNotify
    ? [
        () =>
          notify({
            recipients: [crossCenterNotify.studentId],
            type: "student_added_to_roster",
            title: "Choose your center",
            body: `You attended at ${crossCenterNotify.newCenterName} but are also registered at ${crossCenterNotify.otherNames.join(", ")}. Keep your current center or switch — open the app to choose.`,
            data: {
              action: "center_choice",
              newCenterId: crossCenterNotify.newCenterId,
            },
          }),
      ]
    : [];

  return { value: result, effects };
}

export type DoorOutcome = "present" | "already_present" | "no_counter" | "settled" | "error";

export async function doorTransitionTx(
  tx: TenantTx,
  input: { studentId: string; sessionId: string; actorId: string; teacherId: string; at?: Date },
): Promise<{ outcome: DoorOutcome; reason?: string }> {
  await lockSessionRow(tx, input.sessionId);
  const session = await tx.session.findUnique({
    where: { id: input.sessionId },
    select: { teacherId: true, status: true, distributedAt: true },
  });
  if (!session) return { outcome: "error", reason: "session_not_found" };
  if (session.teacherId !== input.teacherId) {
    return { outcome: "error", reason: "not_your_session" };
  }
  if (lessonClosed(session)) {
    return { outcome: "settled", reason: "session_closed" };
  }

  const record = await tx.attendanceRecord.findUnique({
    where: {
      sessionId_studentId: { sessionId: input.sessionId, studentId: input.studentId },
    },
  });
  if (!record || !record.counterAt) {
    return { outcome: "no_counter", reason: "no_counter_checkin" };
  }
  if (record.doorAt) {
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
        const scan = readStudentScan(input.studentCode);
        if (scan.kind === "unreadable") throw new NotFoundError("Student code not found");
        const code = scan.code;
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
      if (res.outcome === "settled") {
        throw new BusinessRuleError(
          "This lesson has ended — the door register is closed",
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
