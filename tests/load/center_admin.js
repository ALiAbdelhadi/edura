// center_admin (owner) -> /ar/dashboard/admin : home, students, fees, and -- in a
// small centre -- the counter itself. Only 20 owner accounts exist, so at 500 VUs
// 25 VUs share each centre: that over-states per-centre contention on purpose.
import { ERP, options as opts, loadSessions, identity, page, batch, think, pick, counterArrival, cairoDay, summary } from "./lib/common.js";

const sessions = loadSessions("center_admin");
const NAMES = ["page admin/home", "page admin/students", "page admin/fees", "page admin/counter",
  "GET dashboards/admin", "GET sessions?from&to", "GET roster/students", "GET enrollment-requests", "GET payments?from&to",
  "GET reports/net-profit", "GET courses", "GET enrollments?status=active", "GET center/wallet", "GET center/wallet/payouts",
  "GET center/checkin/lookup", "GET center/checkin/suggest", "POST center/checkin", "POST center/subscriptions (cash)", "GET center/counter/roster"];
export const options = opts(NAMES);
export const handleSummary = summary("center_admin");

export default function () {
  const who = identity(sessions, ERP);
  const from = cairoDay(-30), to = cairoDay(0);
  const view = pick([["home", 30], ["students", 25], ["fees", 25], ["counter", 20]]);
  if (view === "home") {
    page(who, "page admin/home", "/ar/dashboard/admin");
    batch(who, [["GET dashboards/admin", "/api/v1/dashboards/admin"], ["GET sessions?from&to", `/api/v1/sessions?from=${cairoDay(-7)}&to=${cairoDay(7)}`]]);
  } else if (view === "students") {
    page(who, "page admin/students", "/ar/dashboard/admin/students");
    batch(who, [["GET roster/students", "/api/v1/roster/students?page=1&pageSize=10"], ["GET enrollment-requests", "/api/v1/enrollment-requests?status=pending"]]);
  } else if (view === "fees") {
    page(who, "page admin/fees", "/ar/dashboard/admin/fees");
    batch(who, [["GET payments?from&to", `/api/v1/payments?from=${from}&to=${to}`], ["GET reports/net-profit", `/api/v1/reports/net-profit?from=${from}&to=${to}`],
      ["GET courses", "/api/v1/courses"], ["GET enrollments?status=active", "/api/v1/enrollments?status=active"],
      ["GET center/wallet", "/api/v1/center/wallet"], ["GET center/wallet/payouts", "/api/v1/center/wallet/payouts"]]);
  } else {
    page(who, "page admin/counter", "/ar/dashboard/admin/counter");
    counterArrival(who, who.c);
  }
  think();
}
