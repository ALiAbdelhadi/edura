// student -> /ar/dashboard/student : schedule, attendance, grades, subscriptions,
// wallet. Read-heavy; the one write a student performs all day is marking a
// notification read. Checkout is a money path and is NOT part of this mix -- see
// money-race.js for the money assertions.
import { ERP, options as opts, loadSessions, identity, page, batch, send, think, pick, json, summary } from "./lib/common.js";

const sessions = loadSessions("student");
const NAMES = ["page student/home", "page student/schedule", "page student/attendance", "page student/grades",
  "page student/subscriptions", "page student/subjects", "page student/wallet",
  "GET dashboards/student", "GET me/wallet", "GET sessions?studentId=me", "GET notifications", "GET me/attendance",
  "GET grades", "GET me/subscriptions", "GET catalog/subjects?mine=1", "GET me/wallet/history", "POST notifications/:id/read"];
export const options = opts(NAMES);
export const handleSummary = summary("student");

export default function () {
  const who = identity(sessions, ERP);
  const view = pick([["home", 30], ["schedule", 20], ["attendance", 15], ["grades", 10], ["subscriptions", 10], ["subjects", 10], ["wallet", 5]]);
  if (view === "home") {
    page(who, "page student/home", "/ar/dashboard/student");
    const r = batch(who, [["GET dashboards/student", "/api/v1/dashboards/student"], ["GET me/wallet", "/api/v1/me/wallet"],
      ["GET sessions?studentId=me", "/api/v1/sessions?studentId=me"], ["GET notifications", "/api/v1/notifications?page=1&pageSize=20"]]);
    if (Math.random() < 0.2) {
      const body = json(r[3]);
      const list = body && body.data ? (Array.isArray(body.data) ? body.data : body.data.items || []) : [];
      const unread = list.find((n) => !n.read && !n.readAt) || list[0];
      if (unread) send(who, "POST", "POST notifications/:id/read", `/api/v1/notifications/${unread.id}/read`);
    }
  } else if (view === "schedule") {
    page(who, "page student/schedule", "/ar/dashboard/student/schedule");
    batch(who, [["GET sessions?studentId=me", "/api/v1/sessions?studentId=me"]]);
  } else if (view === "attendance") {
    page(who, "page student/attendance", "/ar/dashboard/student/attendance");
    batch(who, [["GET me/attendance", "/api/v1/me/attendance"]]);
  } else if (view === "grades") {
    page(who, "page student/grades", "/ar/dashboard/student/grades");
    batch(who, [["GET grades", "/api/v1/grades"]]);
  } else if (view === "subscriptions") {
    page(who, "page student/subscriptions", "/ar/dashboard/student/subscriptions");
    batch(who, [["GET me/subscriptions", "/api/v1/me/subscriptions"]]);
  } else if (view === "subjects") {
    page(who, "page student/subjects", "/ar/dashboard/student/subjects");
    batch(who, [["GET catalog/subjects?mine=1", "/api/v1/catalog/subjects?mine=1"], ["GET me/subscriptions", "/api/v1/me/subscriptions"]]);
  } else {
    page(who, "page student/wallet", "/ar/dashboard/student/wallet");
    batch(who, [["GET me/wallet", "/api/v1/me/wallet"], ["GET me/wallet/history", "/api/v1/me/wallet/history"]]);
  }
  think();
}
