// The teacher's working day. The assistant portal re-exports the teacher's
// screens verbatim, so both roles run this mix; only the cookie, the page paths
// and how the acted-for teacher is found differ.
import { page, batch, get, send, think, pick, json, courseId, todaySession, courseStudents, cairoDay } from "./common.js";

export const TEACHING_NAMES = (role) => [`page ${role}/home`, `page ${role}/attendance`, `page ${role}/classes`, `page ${role}/grades`,
  "GET dashboards/teacher", "GET sessions?from&to", "GET me/affiliations", "GET teacher/wallet", "GET sessions/:id/attendance",
  "GET sessions?teacherId", "GET enrollments?courseId", "PUT sessions/:id/attendance", "GET courses", "GET sessions?courseId",
  "GET grades?courseId", "POST grades", "PUT grades/:id/scores", "GET me"];

export function teachingDay(who, role, c, t, actingTeacherId) {
  const k = 1 + Math.floor(Math.random() * 2);
  const course = courseId(c, t, k);
  const session = todaySession(c, t, k);
  const base = `/ar/dashboard/${role}`;
  const view = pick([["home", 30], ["attendance", 35], ["classes", 15], ["grades", 20]]);

  if (view === "home") {
    page(who, `page ${role}/home`, base);
    const calls = [["GET dashboards/teacher", "/api/v1/dashboards/teacher"],
      ["GET sessions?from&to", `/api/v1/sessions?from=${cairoDay(-30)}&to=${cairoDay(14)}`], ["GET me/affiliations", "/api/v1/me/affiliations"]];
    if (role === "teacher") calls.push(["GET teacher/wallet", "/api/v1/teacher/wallet"]);
    batch(who, calls);
    // the dashboard probes attendance once per visible lesson
    batch(who, [["GET sessions/:id/attendance", `/api/v1/sessions/${todaySession(c, t, 1)}/attendance`],
      ["GET sessions/:id/attendance", `/api/v1/sessions/${todaySession(c, t, 2)}/attendance`]]);
  } else if (view === "attendance") {
    page(who, `page ${role}/attendance`, `${base}/attendance`);
    batch(who, [["GET sessions?teacherId", `/api/v1/sessions?teacherId=${actingTeacherId}`], ["GET enrollments?courseId", `/api/v1/enrollments?courseId=${course}`],
      ["GET sessions/:id/attendance", `/api/v1/sessions/${session}/attendance`]]);
    think();
    const records = courseStudents(c, t, k, 10).map((studentId) => ({ studentId, status: Math.random() < 0.85 ? "present" : "absent" }));
    send(who, "PUT", "PUT sessions/:id/attendance", `/api/v1/sessions/${session}/attendance`, { records });
  } else if (view === "classes") {
    page(who, `page ${role}/classes`, `${base}/classes`);
    batch(who, [["GET courses", "/api/v1/courses?teacherId=me"], ["GET sessions?courseId", `/api/v1/sessions?courseId=${course}`]]);
  } else {
    page(who, `page ${role}/grades`, `${base}/grades`);
    batch(who, [["GET courses", "/api/v1/courses?teacherId=me"], ["GET grades?courseId", `/api/v1/grades?courseId=${course}`],
      ["GET enrollments?courseId", `/api/v1/enrollments?courseId=${course}`]]);
    if (Math.random() < 0.3) {
      think();
      const made = json(send(who, "POST", "POST grades", "/api/v1/grades", { courseId: course, name: `اختبار ${Date.now() % 100000}`, maxScore: 20, date: cairoDay(0) }));
      const gradeId = made && made.data && made.data.id;
      if (gradeId) {
        send(who, "PUT", "PUT grades/:id/scores", `/api/v1/grades/${gradeId}/scores`,
          courseStudents(c, t, k, 10).map((studentId) => ({ studentId, score: Math.floor(Math.random() * 21) })));
      }
    }
  }
  think();
}

export function resolveActingTeacher(who) {
  const body = json(get(who, "GET me", "/api/v1/me"));
  return body && body.data ? body.data.actingTeacherId || body.data.id : null;
}
