// accountant -> apps/superadmin /dashboard/finance : finance dashboard, payouts,
// invoices, the transactions ledger, subscriptions, reports. Read-only: payout
// generation/approval is a monthly, maker-checker action, not a concurrency shape.
// Run AFTER center_staff so the ledger it reads holds rows the real engine wrote.
import { SA, options as opts, loadSessions, identity, page, batch, think, pick, cairoDay, summary } from "./lib/common.js";

const sessions = loadSessions("accountant");
const NAMES = ["page finance/home", "page finance/payouts", "page finance/invoices", "page finance/transactions", "page finance/subscriptions", "page finance/reports",
  "GET finance/dashboard", "GET finance/alerts", "GET finance/reports/revenue", "GET finance/payouts", "GET finance/payouts/counts",
  "GET finance/invoices", "GET finance/transactions", "GET finance/subscriptions", "GET finance/reports/trial-balance", "GET finance/reports/refunds"];
export const options = opts(NAMES);
export const handleSummary = summary("accountant");

export default function () {
  const who = identity(sessions, SA);
  const view = pick([["home", 30], ["transactions", 25], ["subscriptions", 15], ["payouts", 10], ["invoices", 10], ["reports", 10]]);
  const base = "/ar/dashboard/finance";
  if (view === "home") {
    page(who, "page finance/home", base);
    batch(who, [["GET finance/dashboard", "/api/v1/finance/dashboard"], ["GET finance/alerts", "/api/v1/finance/alerts"],
      ["GET finance/reports/revenue", "/api/v1/finance/reports/revenue?period=daily"]]);
  } else if (view === "transactions") {
    page(who, "page finance/transactions", `${base}/transactions`);
    batch(who, [["GET finance/transactions", `/api/v1/finance/transactions?page=${1 + Math.floor(Math.random() * 5)}&limit=25`]]);
  } else if (view === "subscriptions") {
    page(who, "page finance/subscriptions", `${base}/subscriptions`);
    batch(who, [["GET finance/subscriptions", `/api/v1/finance/subscriptions?page=${1 + Math.floor(Math.random() * 5)}&limit=25`]]);
  } else if (view === "payouts") {
    page(who, "page finance/payouts", `${base}/payouts`);
    batch(who, [["GET finance/payouts", "/api/v1/finance/payouts"], ["GET finance/payouts/counts", "/api/v1/finance/payouts/counts"]]);
  } else if (view === "invoices") {
    page(who, "page finance/invoices", `${base}/invoices`);
    batch(who, [["GET finance/invoices", "/api/v1/finance/invoices?page=1&limit=25"]]);
  } else {
    page(who, "page finance/reports", `${base}/reports`);
    batch(who, [["GET finance/reports/trial-balance", `/api/v1/finance/reports/trial-balance?from=${cairoDay(-30)}&to=${cairoDay(0)}`],
      ["GET finance/reports/refunds", "/api/v1/finance/reports/refunds"]]);
  }
  think();
}
