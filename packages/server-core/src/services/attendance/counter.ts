import { Prisma } from "@repo/database";
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

type CounterTeachersRow = {
  sessions: { id: string; teacherId: string; startTime: string; endTime: string }[];
  users: { id: string; name: string; systemStatus: string | null }[];
};

export async function listCounterTeachers(
  admin: SessionUser,
  opts: { q?: string | null } = {},
): Promise<{ teachers: CounterTeacher[]; defaultTeacherId: string | null; clock: string }> {
  const centerId = centerOf(admin);
  const { start, end } = todayBounds();
  const clock = nowClock();
  const q = opts.q?.trim() ?? "";
  const terms = searchTerms(q);
  const frags = terms.length ? literalFragments(q) : [];
  const nameSql = frags.length
    ? Prisma.join(
        narrowFragments(frags, (f) => [f]).map(
          ({ OR }) =>
            Prisma.sql`AND (${Prisma.join(
              OR.map((v) => Prisma.sql`u.name ILIKE ${`%${v}%`}`),
              " OR ",
            )})`,
        ),
        " ",
      )
    : Prisma.empty;

  return platformDb(async (tx) => {
    const [row] = await tx.$queryRaw<CounterTeachersRow[]>`
      WITH s AS (
        SELECT s.id, s.teacher_id, s.start_time, s.end_time
          FROM sessions s
         WHERE s.date >= ${start} AND s.date < ${end}
           AND s.status = 'scheduled'
           AND s.course_id IN (SELECT id FROM courses WHERE center_id = ${centerId}::uuid)
      ), ids AS (
        SELECT teacher_id AS id FROM center_teacher_affiliations
         WHERE center_id = ${centerId}::uuid AND status = 'active' AND removed_at IS NULL
        UNION
        SELECT teacher_id FROM s
      )
      SELECT
        (SELECT coalesce(json_agg(json_build_object(
            'id', s.id, 'teacherId', s.teacher_id, 'startTime', s.start_time, 'endTime', s.end_time
          ) ORDER BY s.start_time ASC), '[]'::json) FROM s) AS sessions,
        (SELECT coalesce(json_agg(json_build_object(
            'id', u.id, 'name', u.name, 'systemStatus', tp.system_status
          )), '[]'::json)
           FROM users u
           LEFT JOIN teacher_profiles tp ON tp.user_id = u.id
          WHERE u.id IN (SELECT id FROM ids)
            AND u.status IN ('active', 'shell')
            AND u.deleted_at IS NULL
            ${nameSql}) AS users`;
    const sessions = row?.sessions ?? [];
    const candidates = row?.users ?? [];
    const users = terms.length
      ? candidates.filter((u) => matchesSearchTerms([u.name], terms))
      : candidates;

    const teachers: CounterTeacher[] = users.map((u) => {
      const mine = sessions.filter((s) => s.teacherId === u.id);
      const live = mine.find((s) => isLive(s, clock)) ?? null;
      const next = mine.find((s) => s.startTime > clock) ?? null;
      return {
        teacherId: u.id,
        name: u.name ?? "—",
        systemStatus: u.systemStatus ?? "enrolled",
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
    const found = await tx.$queryRaw<Omit<CounterSession, "live">[]>`
      SELECT s.id AS "sessionId", s.course_id AS "courseId",
             coalesce(c.title, '—') AS "courseTitle", r.name AS "roomName",
             s.start_time AS "startTime", s.end_time AS "endTime", s.status::text AS status,
             c.price_per_session AS "pricePerSession",
             (SELECT COUNT(*)::int FROM attendance_records a
               WHERE a.session_id = s.id AND a.status IN ('present', 'counter_only')) AS "checkedIn",
             (SELECT COUNT(*)::int FROM enrollments e
               WHERE e.course_id = s.course_id AND e.center_id = ${centerId}::uuid
                 AND e.status = 'active') AS enrolled
        FROM sessions s
        LEFT JOIN courses c ON c.id = s.course_id
        LEFT JOIN rooms r ON r.id = s.room_id
       WHERE s.teacher_id = ${teacherId}::uuid
         AND s.date >= ${start} AND s.date < ${end}
         AND s.course_id IN (SELECT id FROM courses WHERE center_id = ${centerId}::uuid)
       ORDER BY s.start_time ASC`;

    const rows: CounterSession[] = found.map((s) => ({
      sessionId: s.sessionId,
      courseId: s.courseId,
      courseTitle: s.courseTitle,
      roomName: s.roomName,
      startTime: s.startTime,
      endTime: s.endTime,
      status: s.status,
      live: s.status === "scheduled" && isLive(s, clock),
      pricePerSession: s.pricePerSession,
      checkedIn: s.checkedIn,
      enrolled: s.enrolled,
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

const ISO_MS = `'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'`;
const iso = (col: string) =>
  Prisma.sql`to_char(${Prisma.raw(col)} AT TIME ZONE 'UTC', ${Prisma.raw(ISO_MS)})`;

type RosterRow = {
  ok: boolean;
  id: string;
  courseId: string;
  teacherId: string;
  date: string;
  startTime: string;
  endTime: string;
  status: string;
  courseTitle: string;
  pricePerSession: number | null;
  teacherName: string | null;
  roomName: string | null;
  attendanceMode: string | null;
  enrollments: string[];
  records: { studentId: string; status: string; counterAt: string | null; doorAt: string | null }[];
  passes: string[];
  profiles: {
    userId: string;
    fullName: string;
    studentCode: string;
    phone: string | null;
    userName: string | null;
    userPhone: string | null;
  }[];
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
    const [row] = await tx.$queryRaw<RosterRow[]>`
      WITH s AS (
        SELECT s.id, s.course_id, s.teacher_id, s.room_id, s.date, s.start_time, s.end_time,
               s.status, c.center_id, c.title, c.price_per_session,
               (c.center_id IS NOT DISTINCT FROM ${centerId}::uuid) AS ok
          FROM sessions s
          LEFT JOIN courses c ON c.id = s.course_id
         WHERE s.id = ${sessionId}::uuid
      ), en AS (
        SELECT e.student_id FROM enrollments e, s
         WHERE s.ok AND e.course_id = s.course_id AND e.center_id = ${centerId}::uuid
           AND e.status = 'active'
      ), rec AS (
        SELECT a.student_id, a.status, a.counter_at, a.door_at FROM attendance_records a, s
         WHERE s.ok AND a.session_id = s.id
      ), pass AS (
        SELECT p.student_id FROM subscriptions p, s
         WHERE s.ok AND p.plan = 'per_session' AND p.session_id = s.id AND p.status = 'active'
      )
      SELECT
        s.ok, s.id, s.course_id AS "courseId", s.teacher_id AS "teacherId",
        ${iso("s.date")} AS date, s.start_time AS "startTime", s.end_time AS "endTime",
        s.status::text AS status, s.title AS "courseTitle", s.price_per_session AS "pricePerSession",
        (SELECT name FROM users WHERE id = s.teacher_id) AS "teacherName",
        (SELECT name FROM rooms WHERE id = s.room_id) AS "roomName",
        (SELECT attendance_mode::text FROM teacher_profiles WHERE user_id = s.teacher_id)
          AS "attendanceMode",
        (SELECT coalesce(json_agg(student_id), '[]'::json) FROM en) AS enrollments,
        (SELECT coalesce(json_agg(json_build_object(
            'studentId', student_id, 'status', status,
            'counterAt', ${iso("counter_at")}, 'doorAt', ${iso("door_at")}
          )), '[]'::json) FROM rec) AS records,
        (SELECT coalesce(json_agg(student_id), '[]'::json) FROM pass) AS passes,
        (SELECT coalesce(json_agg(json_build_object(
            'userId', sp.user_id, 'fullName', sp.full_name, 'studentCode', sp.student_code,
            'phone', sp.phone, 'userName', u.name, 'userPhone', u.phone
          )), '[]'::json)
           FROM student_profiles sp
           LEFT JOIN users u ON u.id = sp.user_id
          WHERE sp.user_id IN (SELECT student_id FROM en UNION SELECT student_id FROM rec
                               UNION SELECT student_id FROM pass)) AS profiles
        FROM s`;
    if (!row) throw new NotFoundError("Session not found");
    if (!row.ok) throw new ForbiddenError("Session is not at your center");

    const { enrollments, records, passes, profiles } = row;
    const session = {
      id: row.id,
      courseId: row.courseId,
      teacherId: row.teacherId,
      date: new Date(row.date),
      startTime: row.startTime,
      endTime: row.endTime,
      status: row.status,
    };
    const enrolledIds = new Set(enrollments);
    const studentIds = [...new Set([...enrollments, ...records.map((r) => r.studentId), ...passes])];

    const profileMap = new Map(profiles.map((p) => [p.userId, p]));
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
        name: p?.userName ?? p?.fullName ?? "—",
        studentCode: p?.studentCode ?? null,
        phone: p?.userPhone ?? p?.phone ?? null,
        enrolled: enrolledIds.has(id),
        covered: covered.has(id),
        attendance: r?.status ?? null,
        counterAt: r?.counterAt ?? null,
        doorAt: r?.doorAt ?? null,
      };
    });
    students.sort((a, b) => a.name.localeCompare(b.name));

    const present = students.filter((s) => s.attendance === "present").length;
    const counterOnly = students.filter((s) => s.attendance === "counter_only").length;

    return {
      session: {
        sessionId: session.id,
        courseId: session.courseId,
        courseTitle: row.courseTitle,
        teacherId: session.teacherId,
        teacherName: row.teacherName ?? "—",
        roomName: row.roomName,
        startTime: session.startTime,
        endTime: session.endTime,
        status: session.status,
        live: session.status === "scheduled" && isLive(session, clock),
        pricePerSession: row.pricePerSession,
        attendanceMode: row.attendanceMode ?? "counter_only",
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
