// super_admin -> apps/superadmin : dashboard, user directory, centres, audit log,
// the search palette. Read-only by design: a super_admin's writes are rare,
// individually audited one-offs (suspend a user, reset 2FA), not a load shape.
import { SA, options as opts, loadSessions, identity, page, batch, get, think, pick, centerId, summary } from "./lib/common.js";

const sessions = loadSessions("super_admin");
const NAMES = ["page superadmin/home", "page superadmin/users", "page superadmin/centers", "page superadmin/audit",
  "GET admin/dashboard/kpis", "GET admin/dashboard/decision-queue", "GET admin/dashboard/revenue-chart", "GET admin/dashboard/user-growth-chart",
  "GET admin/users", "GET admin/users?q", "GET admin/users?role", "GET admin/centers", "GET admin/centers/:id", "GET oversight/overview",
  "GET oversight/students", "GET admin/audit-logs", "GET admin/audit-logs/actions", "GET search?q"];
export const options = opts(NAMES);
export const handleSummary = summary("super_admin");

const QUERIES = ["طالب 3", "مدرس 12", "مركز", "load-parent-7", "احمد", "استقبال 5"];

export default function () {
  const who = identity(sessions, SA);
  const view = pick([["home", 25], ["users", 30], ["centers", 20], ["audit", 15], ["search", 10]]);
  if (view === "home") {
    page(who, "page superadmin/home", "/ar/dashboard/superadmin");
    batch(who, [["GET admin/dashboard/kpis", "/api/v1/admin/dashboard/kpis"], ["GET admin/dashboard/decision-queue", "/api/v1/admin/dashboard/decision-queue"],
      ["GET admin/dashboard/revenue-chart", "/api/v1/admin/dashboard/revenue-chart?period=monthly"], ["GET admin/dashboard/user-growth-chart", "/api/v1/admin/dashboard/user-growth-chart"]]);
  } else if (view === "users") {
    page(who, "page superadmin/users", "/ar/dashboard/superadmin/users");
    batch(who, [["GET admin/users", "/api/v1/admin/users?take=25"]]);
    think();
    if (Math.random() < 0.5) get(who, "GET admin/users?q", `/api/v1/admin/users?take=25&q=${encodeURIComponent(QUERIES[Math.floor(Math.random() * QUERIES.length)])}`);
    else get(who, "GET admin/users?role", "/api/v1/admin/users?take=25&role=student");
  } else if (view === "centers") {
    page(who, "page superadmin/centers", "/ar/dashboard/superadmin/centers");
    batch(who, [["GET admin/centers", "/api/v1/admin/centers?take=25"]]);
    think();
    const id = centerId(1 + Math.floor(Math.random() * 20));
    batch(who, [["GET admin/centers/:id", `/api/v1/admin/centers/${id}`], ["GET oversight/overview", `/api/v1/admin/centers/${id}/oversight/overview`],
      ["GET oversight/students", `/api/v1/admin/centers/${id}/oversight/students?page=1&limit=25`]]);
  } else if (view === "audit") {
    page(who, "page superadmin/audit", "/ar/dashboard/superadmin/audit");
    batch(who, [["GET admin/audit-logs", "/api/v1/admin/audit-logs?page=1&limit=50"], ["GET admin/audit-logs/actions", "/api/v1/admin/audit-logs/actions"]]);
  } else {
    get(who, "GET search?q", `/api/v1/search?locale=ar&q=${encodeURIComponent(QUERIES[Math.floor(Math.random() * QUERIES.length)])}`);
  }
  think();
}
