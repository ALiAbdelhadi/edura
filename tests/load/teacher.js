// teacher -> /ar/dashboard/teacher : today's lessons, attendance, grades.
// Writes: bulk attendance for a lesson, a new grade + its scores.
import { ERP, options as opts, loadSessions, identity, teacherId, summary } from "./lib/common.js";
import { TEACHING_NAMES, teachingDay } from "./lib/teaching.js";

const sessions = loadSessions("teacher");
export const options = opts(TEACHING_NAMES("teacher"));
export const handleSummary = summary("teacher");

export default function () {
  const who = identity(sessions, ERP);
  teachingDay(who, "teacher", who.c, who.n, teacherId(who.c, who.n));
}
