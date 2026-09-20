// center_staff (receptionist) -> /ar/dashboard/staff : the counter. This is the
// platform's true peak path: a queue of students in the half hour before lessons.
// 85% of iterations are one student arriving; 15% are the board being reloaded.
// The cash-for-one-lesson branch is a REAL money write; run.sh reconciles the
// ledger against `money_writes_ok` after the run.
import { ERP, options as opts, loadSessions, identity, page, batch, get, think, json, counterArrival, summary } from "./lib/common.js";

const sessions = loadSessions("center_staff");
const NAMES = ["page staff/home", "GET center/counter/teachers", "GET center/shifts/current", "GET center/counter/sessions",
  "GET center/counter/roster", "GET center/checkin/lookup", "GET center/checkin/suggest", "POST center/checkin",
  "POST center/subscriptions (cash)"];
export const options = opts(NAMES);
export const handleSummary = summary("center_staff");

export default function () {
  const who = identity(sessions, ERP);
  if (Math.random() < 0.15) {
    page(who, "page staff/home", "/ar/dashboard/staff");
    const r = batch(who, [["GET center/counter/teachers", "/api/v1/center/counter/teachers"], ["GET center/shifts/current", "/api/v1/center/shifts/current"]]);
    const body = json(r[0]);
    const teachers = body && body.data && body.data.teachers ? body.data.teachers : [];
    const t = teachers[Math.floor(Math.random() * teachers.length)];
    if (t) {
      const s = json(get(who, "GET center/counter/sessions", `/api/v1/center/counter/sessions?teacherId=${t.teacherId}`));
      const first = s && s.data && s.data.sessions && s.data.sessions[0];
      if (first) get(who, "GET center/counter/roster", `/api/v1/center/counter/roster?sessionId=${first.sessionId}`);
    }
  } else {
    counterArrival(who, who.c);
  }
  think();
}
