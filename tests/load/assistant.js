// assistant -> /ar/dashboard/assistant : the teacher's screens, on the teacher's
// behalf. The server resolves the acted-for teacher from the session; the client
// only learns it from /me, so that is what this does. Every write also lands an
// "on behalf of" audit row -- one more insert than the teacher's own write.
import { ERP, options as opts, loadSessions, identity, summary } from "./lib/common.js";
import { TEACHING_NAMES, teachingDay, resolveActingTeacher } from "./lib/teaching.js";

const sessions = loadSessions("assistant");
export const options = opts(TEACHING_NAMES("assistant"));
export const handleSummary = summary("assistant");

let acting = null;

export default function () {
  const who = identity(sessions, ERP);
  if (!acting) acting = resolveActingTeacher(who);
  teachingDay(who, "assistant", who.c, who.n, acting);
}
