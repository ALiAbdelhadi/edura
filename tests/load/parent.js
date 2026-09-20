// parent -> /ar/dashboard/parent : children, attendance, fees, progress, wallet.
// Every child-scoped call carries ?studentId=<child>, resolved once from
// /me/children exactly as the child selector does. Write: notification read.
import { ERP, options as opts, loadSessions, identity, page, batch, get, send, think, pick, json, summary } from "./lib/common.js";

const sessions = loadSessions("parent");
const NAMES = ["page parent/home", "page parent/attendance", "page parent/fees", "page parent/progress", "page parent/wallet",
  "GET me/children", "GET grades?studentId", "GET payments?studentId", "GET me/attendance?studentId", "GET notifications",
  "GET enrollments?studentId", "GET me/subscriptions?studentId", "GET me/parent-wallet", "GET me/parent-wallet/history",
  "POST notifications/:id/read"];
export const options = opts(NAMES);
export const handleSummary = summary("parent");

let children = null;

export default function () {
  const who = identity(sessions, ERP);
  if (!children) {
    const body = json(get(who, "GET me/children", "/api/v1/me/children"));
    const list = body && body.data ? (Array.isArray(body.data) ? body.data : body.data.items || []) : [];
    children = list.map((ch) => ch.id || ch.studentId).filter(Boolean);
    if (!children.length) children = [""];
  }
  const kid = children[Math.floor(Math.random() * children.length)];
  const view = pick([["home", 35], ["attendance", 20], ["fees", 20], ["progress", 15], ["wallet", 10]]);
  if (view === "home") {
    page(who, "page parent/home", "/ar/dashboard/parent");
    const r = batch(who, [["GET me/children", "/api/v1/me/children"], ["GET grades?studentId", `/api/v1/grades?studentId=${kid}`],
      ["GET payments?studentId", `/api/v1/payments?studentId=${kid}`], ["GET me/attendance?studentId", `/api/v1/me/attendance?studentId=${kid}`],
      ["GET notifications", "/api/v1/notifications?page=1&pageSize=20"]]);
    if (Math.random() < 0.2) {
      const body = json(r[4]);
      const list = body && body.data ? (Array.isArray(body.data) ? body.data : body.data.items || []) : [];
      if (list[0]) send(who, "POST", "POST notifications/:id/read", `/api/v1/notifications/${list[0].id}/read`);
    }
  } else if (view === "attendance") {
    page(who, "page parent/attendance", "/ar/dashboard/parent/attendance");
    batch(who, [["GET me/attendance?studentId", `/api/v1/me/attendance?studentId=${kid}`], ["GET enrollments?studentId", `/api/v1/enrollments?studentId=${kid}`]]);
  } else if (view === "fees") {
    page(who, "page parent/fees", "/ar/dashboard/parent/fees");
    batch(who, [["GET payments?studentId", `/api/v1/payments?studentId=${kid}`], ["GET me/subscriptions?studentId", `/api/v1/me/subscriptions?studentId=${kid}`]]);
  } else if (view === "progress") {
    page(who, "page parent/progress", "/ar/dashboard/parent/progress");
    batch(who, [["GET grades?studentId", `/api/v1/grades?studentId=${kid}`]]);
  } else {
    page(who, "page parent/wallet", "/ar/dashboard/parent/wallet");
    batch(who, [["GET me/parent-wallet", "/api/v1/me/parent-wallet"], ["GET me/parent-wallet/history", "/api/v1/me/parent-wallet/history"]]);
  }
  think();
}
