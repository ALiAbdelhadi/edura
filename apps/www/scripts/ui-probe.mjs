#!/usr/bin/env node
// Walk every dashboard route per role using a real Chromium browser, capture
// console errors, network failures, page errors, missing UI bits, and write a
// JSON report. Run while the harness server from ui-test-setup.mjs is live.

import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const BASE = process.env.BASE_URL || "http://localhost:3002";
const OUT = join(process.cwd(), "tests", "ui-probe");
await mkdir(OUT, { recursive: true });

const ACCOUNTS = [
  { role: "admin",   email: "admin@nile-academy.eg",                 password: "Passw0rd!",
    routes: ["/dashboard/admin", "/dashboard/admin/students", "/dashboard/admin/teachers",
             "/dashboard/admin/classes", "/dashboard/admin/rooms", "/dashboard/admin/fees",
             "/dashboard/admin/expenses", "/dashboard/admin/reports",
             "/dashboard/admin/enrollment-requests", "/dashboard/admin/messages",
             "/dashboard/admin/notifications", "/dashboard/admin/settings"] },
  { role: "teacher", email: "hossam.aziz@nile-academy.eg",           password: "Passw0rd!",
    routes: ["/dashboard/teacher", "/dashboard/teacher/classes", "/dashboard/teacher/attendance",
             "/dashboard/teacher/assignments", "/dashboard/teacher/grades",
             "/dashboard/teacher/materials", "/dashboard/teacher/centers",
             "/dashboard/teacher/reviews", "/dashboard/teacher/messages",
             "/dashboard/teacher/notifications", "/dashboard/teacher/settings"] },
  { role: "student", email: "lina.hassan@student.nile-academy.eg",   password: "Passw0rd!",
    routes: ["/dashboard/student", "/dashboard/student/courses", "/dashboard/student/schedule",
             "/dashboard/student/attendance", "/dashboard/student/assignments", "/dashboard/student/grades",
             "/dashboard/student/materials", "/dashboard/student/family",
             "/dashboard/student/reviews", "/dashboard/student/messages",
             "/dashboard/student/notifications", "/dashboard/student/settings"] },
  { role: "parent",  email: "mona.hassan@email.eg",                  password: "Passw0rd!",
    routes: ["/dashboard/parent", "/dashboard/parent/children", "/dashboard/parent/attendance",
             "/dashboard/parent/progress", "/dashboard/parent/fees",
             "/dashboard/parent/messages", "/dashboard/parent/notifications",
             "/dashboard/parent/settings"] },
];

const report = { base: BASE, startedAt: new Date().toISOString(), results: [] };

const browser = await chromium.launch({
  headless: true,
  channel: "chrome",
});

for (const acct of ACCOUNTS) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const acctResult = { role: acct.role, email: acct.email, login: null, pages: [] };

  // Capture per-context console & network failures keyed by current url
  const consoleErrors = [];
  const pageErrors = [];
  const networkFailures = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push({ at: page.url(), text: msg.text() });
    if (msg.type() === "warning") consoleErrors.push({ at: page.url(), level: "warn", text: msg.text() });
  });
  page.on("pageerror", (err) => pageErrors.push({ at: page.url(), text: String(err) }));
  page.on("requestfailed", (req) => {
    const url = req.url();
    const failure = req.failure()?.errorText;
    if (failure === "net::ERR_ABORTED" && url.includes("_rsc=")) return;
    networkFailures.push({ at: page.url(), url, method: req.method(), failure });
  });
  page.on("response", async (resp) => {
    const status = resp.status();
    const url = resp.url();
    if (status >= 400 && url.includes("/api/")) {
      let bodySnippet;
      try { bodySnippet = (await resp.text()).slice(0, 200); } catch {}
      networkFailures.push({ at: page.url(), url, status, body: bodySnippet });
    }
  });

  // Login flow — first capture the login page rendering for inspection,
  // then call API directly (avoids the buggy form-submit) so the rest of the
  // suite can exercise authenticated dashboards.
  try {
    await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(800);
    await page.screenshot({ path: join(OUT, `login-${acct.role}.png`), fullPage: true }).catch(()=>{});
    // Try the actual UI submit (record whether it works as a UX check)
    let uiSubmitWorks = false;
    try {
      await page.fill('input[type="email"]', acct.email, { timeout: 5000 });
      await page.fill('input[type="password"]', acct.password, { timeout: 5000 });
      await Promise.all([
        page.waitForURL(/\/dashboard/, { timeout: 8000 }),
        page.click('button[type="submit"]', { timeout: 5000, noWaitAfter: true }),
      ]);
      uiSubmitWorks = true;
    } catch {}
    acctResult.uiSubmitWorks = uiSubmitWorks;
    if (!uiSubmitWorks) {
      // Fall back: set cookies via API so we can still test dashboards.
      const apiResp = await page.request.post(`${BASE}/api/v1/auth/login`, {
        data: { email: acct.email, password: acct.password },
        headers: { "content-type": "application/json" },
      });
      if (!apiResp.ok()) throw new Error(`api login ${apiResp.status()}`);
    }
    // Seed localStorage (login flow relies on this for client-side role routing)
    await page.goto(`${BASE}/dashboard`, { waitUntil: "domcontentloaded", timeout: 20000 });
    await page.waitForTimeout(1500);
    acctResult.login = { ok: true, url: page.url(), uiSubmitWorks };
  } catch (e) {
    acctResult.login = { ok: false, error: String(e), url: page.url() };
    await page.screenshot({ path: join(OUT, `login-fail-${acct.role}.png`), fullPage: true }).catch(()=>{});
    report.results.push(acctResult);
    await ctx.close();
    continue;
  }

  for (const route of acct.routes) {
    const before = { c: consoleErrors.length, p: pageErrors.length, n: networkFailures.length };
    const pageResult = { route, status: "ok" };
    try {
      const resp = await page.goto(`${BASE}${route}`, { waitUntil: "domcontentloaded", timeout: 30000 });
      pageResult.httpStatus = resp?.status() ?? null;
      // Wait briefly for client renders
      await page.waitForTimeout(800);
      // Detect blank pages / error boundaries
      const bodyText = await page.evaluate(() => document.body.innerText.trim());
      pageResult.bodyChars = bodyText.length;
      if (bodyText.length < 30) pageResult.warnings = (pageResult.warnings ?? []).concat("body too small");
      if (/Something went wrong|Application error|404|Failed to load/i.test(bodyText)) {
        pageResult.warnings = (pageResult.warnings ?? []).concat("error text in body");
      }
      // Detect AntD error/empty default states
      const errorAlerts = await page.locator(".ant-alert-error, .ant-result-error, .ant-result-500").count();
      if (errorAlerts > 0) pageResult.warnings = (pageResult.warnings ?? []).concat(`${errorAlerts} antd error/result`);

      const slug = route.replaceAll("/", "_").replace(/^_+/, "");
      await page.screenshot({ path: join(OUT, `${acct.role}-${slug || "root"}.png`), fullPage: true }).catch(()=>{});
    } catch (e) {
      pageResult.status = "exception";
      pageResult.error = String(e);
    }
    pageResult.newConsole = consoleErrors.slice(before.c);
    pageResult.newPageErrors = pageErrors.slice(before.p);
    pageResult.newNetworkFailures = networkFailures.slice(before.n);
    acctResult.pages.push(pageResult);
  }

  report.results.push(acctResult);
  await ctx.close();
}

await browser.close();
report.finishedAt = new Date().toISOString();
await writeFile(join(OUT, "report.json"), JSON.stringify(report, null, 2));

// Pretty summary
let total = 0, withIssues = 0;
for (const acct of report.results) {
  if (!acct.login?.ok) { console.log(`✗ ${acct.role}: login failed — ${acct.login?.error}`); continue; }
  for (const p of acct.pages) {
    total++;
    const issues = [
      p.status !== "ok" ? p.status : null,
      p.httpStatus && p.httpStatus >= 400 ? `http ${p.httpStatus}` : null,
      ...(p.warnings ?? []),
      p.newPageErrors.length ? `${p.newPageErrors.length} pageerr` : null,
      p.newConsole.filter((c) => c.level !== "warn").length ? `${p.newConsole.filter((c) => c.level !== "warn").length} console err` : null,
      p.newNetworkFailures.length ? `${p.newNetworkFailures.length} net fail` : null,
    ].filter(Boolean);
    if (issues.length) { withIssues++; console.log(`! ${acct.role} ${p.route} — ${issues.join("; ")}`); }
    else console.log(`✓ ${acct.role} ${p.route}`);
  }
}
console.log(`\n${total - withIssues}/${total} pages clean. Report → ${join(OUT, "report.json")}`);
