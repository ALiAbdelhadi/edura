import { platformDb } from "../../db/scope";
import {
  literalFragments,
  matchesSearchTerms,
  narrowFragments,
  searchTerms,
} from "@repo/database/search-text";
import { ForbiddenError, NotFoundError } from "../../errors/classes";
import type { SessionUser } from "../../auth/types";
import { PLATFORM_TIME_ZONE, todayKey } from "../../lib/date-key";
import { coveredStudentIds } from "../subscriptions/coverage";

const CLOCK_FORMAT = new Intl.DateTimeFormat("en-GB", {
  timeZone: PLATFORM_TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function nowClock(now: Date = new Date()): string {
  return CLOCK_FORMAT.format(now);
}

function todayBounds(now: Date = new Date()): { start: Date; end: Date } {
  const start = new Date(`${todayKey(now)}T00:00:00.000Z`);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start, end };
}

function isLive(s: { startTime: string; endTime: string }, clock: string): boolean {
  return s.startTime <= clock && clock < s.endTime;
}

function centerOf(admin: SessionUser): string {
  if (!admin.centerId) throw new ForbiddenError("Actor has no center scope");
  return admin.centerId;
}

export type CounterTeacher = {
  teacherId: string;
  name: string;
  systemStatus: string;
  sessionsToday: number;
  liveSessionId: string | null;
  nextSessionId: string | null;
  nextStartTime: string | null;
};

export async function listCounterTeachers(
  admin: SessionUser,
  opts: { q?: string | null } = {},
): Promise<{ teachers: CounterTeacher[]; defaultTeacherId: string | null; clock: string }> {
  const centerId = centerOf(admin);
  const { start, end } = todayBounds();
  const clock = nowClock();
  const q = opts.q?.trim() ?? "";

  return platformDb(async (tx) => {
    const affiliations = await tx.centerTeacherAffiliation.findMany({
      where: { centerId, status: "active", removedAt: null },
      select: { teacherId: true },
    });

    const sessions = await tx.session.findMany({
      where: {
        date: { gte: start, lt: end },
        status: "scheduled",
        course: { centerId },
      },
      select: { id: true, teacherId: true, startTime: true, endTime: true },
      orderBy: { startTime: "asc" },
    });

    const teacherIds = [
      ...new Set([...affiliations.map((a) => a.teacherId), ...sessions.map((s) => s.teacherId)]),
    ];
    if (teacherIds.length === 0) return { teachers: [], defaultTeacherId: null, clock };

    const terms = searchTerms(q ?? "");
    const candidates = await tx.user.findMany({
      where: {
        id: { in: teacherIds },
        status: { in: ["active", "shell"] },
        ...(terms.length
          ? {
              AND: narrowFragments(literalFragments(q ?? ""), (f) => [
                { name: { contains: f, mode: "insensitive" as const } },
              ]),
            }
          : {}),
      },
      select: { id: true, name: true },
    });
    const users = terms.length
      ? candidates.filter((u) => matchesSearchTerms([u.name], terms))
      : candidates;
    const profiles = await tx.teacherProfile.findMany({
      where: { userId: { in: teacherIds } },
      select: { userId: true, systemStatus: true },
    });
    const systemStatusById = new Map(profiles.map((p) => [p.userId, p.systemStatus]));

    const teachers: CounterTeacher[] = users.map((u) => {
      const mine = sessions.filter((s) => s.teacherId === u.id);
      const live = mine.find((s) => isLive(s, clock)) ?? null;
      const next = mine.find((s) => s.startTime > clock) ?? null;
      return {
        teacherId: u.id,
        name: u.name ?? "—",
        systemStatus: systemStatusById.get(u.id) ?? "enrolled",
        sessionsToday: mine.length,
        liveSessionId: live?.id ?? null,
        nextSessionId: next?.id ?? null,
        nextStartTime: next?.startTime ?? null,
      };
    });

    teachers.sort((a, b) => {
      if (!!a.liveSessionId !== !!b.liveSessionId) return a.liveSessionId ? -1 : 1;
      if (a.nextStartTime !== b.nextStartTime) {
        if (a.nextStartTime === null) return 1;
        if (b.nextStartTime === null) return -1;
        return a.nextStartTime.localeCompare(b.nextStartTime);
      }
      if (a.sessionsToday !== b.sessionsToday) return b.sessionsToday - a.sessionsToday;
      return a.name.localeCompare(b.name);
    });

    const liveSession = sessions.find((s) => isLive(s, clock)) ?? null;
    const nextSession = sessions.find((s) => s.startTime > clock) ?? null;
    const defaultTeacherId = liveSession?.teacherId ?? nextSession?.teacherId ?? null;

    return { teachers, defaultTeacherId, clock };
  });
}

export type CounterSession = {
  sessionId: string;
  courseId: string;
  courseTitle: string;
  roomName: string | null;
  startTime: string;
  endTime: string;
  status: string;
  live: boolean;
  pricePerSession: number | null;
  checkedIn: number;
  enrolled: number;
};

export async function listCounterSessions(
  teacherId: string,
  admin: SessionUser,
): Promise<{ sessions: CounterSession[]; defaultSessionId: string | null; clock: string }> {
  const centerId = centerOf(admin);
  const { start, end } = todayBounds();
  const clock = nowClock();

  return platformDb(async (tx) => {
    const sessions = await tx.session.findMany({
      where: {
        teacherId,
        date: { gte: start, lt: end },
        course: { centerId },
      },
      select: {
        id: true,
        courseId: true,
        roomId: true,
        startTime: true,
        endTime: true,
        status: true,
      },
      orderBy: { startTime: "asc" },
    });
    if (sessions.length === 0) return { sessions: [], defaultSessionId: null, clock };

    const courseIds = [...new Set(sessions.map((s) => s.courseId))];
    const roomIds = [...new Set(sessions.map((s) => s.roomId).filter(Boolean) as string[])];
    const [courses, rooms, attendance, enrollments] = await Promise.all([
      tx.course.findMany({
        where: { id: { in: courseIds } },
        select: { id: true, title: true, pricePerSession: true },
      }),
      roomIds.length
        ? tx.room.findMany({ where: { id: { in: roomIds } }, select: { id: true, name: true } })
        : Promise.resolve([] as { id: string; name: string }[]),
      tx.attendanceRecord.findMany({
        where: { sessionId: { in: sessions.map((s) => s.id) } },
        select: { sessionId: true, status: true },
      }),
      tx.enrollment.findMany({
        where: { courseId: { in: courseIds }, centerId, status: "active" },
        select: { courseId: true },
      }),
    ]);
    const courseMap = new Map(courses.map((c) => [c.id, c]));
    const roomMap = new Map(rooms.map((r) => [r.id, r.name]));

    const rows: CounterSession[] = sessions.map((s) => ({
      sessionId: s.id,
      courseId: s.courseId,
      courseTitle: courseMap.get(s.courseId)?.title ?? "—",
      roomName: s.roomId ? (roomMap.get(s.roomId) ?? null) : null,
      startTime: s.startTime,
      endTime: s.endTime,
      status: s.status,
      live: s.status === "scheduled" && isLive(s, clock),
      pricePerSession: courseMap.get(s.courseId)?.pricePerSession ?? null,
      checkedIn: attendance.filter(
        (a) => a.sessionId === s.id && (a.status === "present" || a.status === "counter_only"),
      ).length,
      enrolled: enrollments.filter((e) => e.courseId === s.courseId).length,
    }));

    const defaultSessionId =
      rows.find((r) => r.live)?.sessionId ??
      rows.find((r) => r.status === "scheduled" && r.startTime > clock)?.sessionId ??
      rows.find((r) => r.status === "scheduled")?.sessionId ??
      rows[0]?.sessionId ??
      null;

    return { sessions: rows, defaultSessionId, clock };
  });
}

export type CounterRosterRow = {
  studentId: string;
  name: string;
  studentCode: string | null;
  phone: string | null;
  enrolled: boolean;
  covered: boolean;
  attendance: string | null;
  counterAt: string | null;
  doorAt: string | null;
};

export async function counterRoster(
  sessionId: string,
  admin: SessionUser,
): Promise<{
  session: {
    sessionId: string;
    courseId: string;
    courseTitle: string;
    teacherId: string;
    teacherName: string;
    roomName: string | null;
    startTime: string;
    endTime: string;
    status: string;
    live: boolean;
    pricePerSession: number | null;
    attendanceMode: string;
  };
  counts: { checkedIn: number; present: number; counterOnly: number; total: number; covered: number };
  students: CounterRosterRow[];
}> {
  const centerId = centerOf(admin);
  const clock = nowClock();

  return platformDb(async (tx) => {
    const session = await tx.session.findUnique({
      where: { id: sessionId },
      select: {
        id: true,
        courseId: true,
        teacherId: true,
        roomId: true,
        date: true,
        startTime: true,
        endTime: true,
        status: true,
      },
    });
    if (!session) throw new NotFoundError("Session not found");

    const course = await tx.course.findUnique({
      where: { id: session.courseId },
      select: { id: true, title: true, centerId: true, pricePerSession: true },
    });
    if (!course || course.centerId !== centerId) {
      throw new ForbiddenError("Session is not at your center");
    }

    const [enrollments, records, passes, teacher, room, teacherProfile] = await Promise.all([
      tx.enrollment.findMany({
        where: { courseId: session.courseId, centerId, status: "active" },
        select: { studentId: true },
      }),
      tx.attendanceRecord.findMany({
        where: { sessionId },
        select: { studentId: true, status: true, counterAt: true, doorAt: true },
      }),
      tx.subscription.findMany({
        where: { plan: "per_session", sessionId, status: "active" },
        select: { studentId: true },
      }),
      tx.user.findUnique({ where: { id: session.teacherId }, select: { name: true } }),
      session.roomId
        ? tx.room.findUnique({ where: { id: session.roomId }, select: { name: true } })
        : Promise.resolve(null),
      tx.teacherProfile.findUnique({
        where: { userId: session.teacherId },
        select: { attendanceMode: true },
      }),
    ]);

    const enrolledIds = new Set(enrollments.map((e) => e.studentId));
    const studentIds = [
      ...new Set([
        ...enrollments.map((e) => e.studentId),
        ...records.map((r) => r.studentId),
        ...passes.map((p) => p.studentId),
      ]),
    ];

    const profiles = studentIds.length
      ? await tx.studentProfile.findMany({
          where: { userId: { in: studentIds } },
          select: {
            userId: true,
            fullName: true,
            studentCode: true,
            phone: true,
            user: { select: { name: true, phone: true } },
          },
        })
      : [];
    const profileMap = new Map(profiles.map((p) => [p.userId as string, p]));
    const recordMap = new Map(records.map((r) => [r.studentId, r]));
    const covered = await coveredStudentIds(
      tx,
      { id: session.id, courseId: session.courseId, date: session.date },
      studentIds,
    );

    const students: CounterRosterRow[] = studentIds.map((id) => {
      const p = profileMap.get(id);
      const r = recordMap.get(id);
      return {
        studentId: id,
        name: p?.user?.name ?? p?.fullName ?? "—",
        studentCode: p?.studentCode ?? null,
        phone: p?.user?.phone ?? p?.phone ?? null,
        enrolled: enrolledIds.has(id),
        covered: covered.has(id),
        attendance: r?.status ?? null,
        counterAt: r?.counterAt?.toISOString() ?? null,
        doorAt: r?.doorAt?.toISOString() ?? null,
      };
    });
    students.sort((a, b) => a.name.localeCompare(b.name));

    const present = students.filter((s) => s.attendance === "present").length;
    const counterOnly = students.filter((s) => s.attendance === "counter_only").length;

    return {
      session: {
        sessionId: session.id,
        courseId: session.courseId,
        courseTitle: course.title,
        teacherId: session.teacherId,
        teacherName: teacher?.name ?? "—",
        roomName: room?.name ?? null,
        startTime: session.startTime,
        endTime: session.endTime,
        status: session.status,
        live: session.status === "scheduled" && isLive(session, clock),
        pricePerSession: course.pricePerSession,
        attendanceMode: teacherProfile?.attendanceMode ?? "counter_only",
      },
      counts: {
        checkedIn: present + counterOnly,
        present,
        counterOnly,
        total: students.length,
        covered: students.filter((s) => s.covered).length,
      },
      students,
    };
  });
}
