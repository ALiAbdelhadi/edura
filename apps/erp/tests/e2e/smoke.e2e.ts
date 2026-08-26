/// <reference types="bun" />
/**
 * E2E smoke suite — bun test + the playwright LIBRARY, no Node anywhere.
 *
 * The reference above is what makes `bun:test` resolve. Every other @types
 * package this app uses arrives through a module specifier; `@types/bun` is
 * ambient-only, and TypeScript 7 does not pull ambient type packages in from
 * node_modules/@types on its own the way 5.x did.
 *
 * Replaces tests/playwright/*.spec.ts as the runnable E2E entry point. Those
 * specs predate the shadcn/i18n migrations (they assert `.ant-alert` classes
 * and English copy the app no longer renders) and do not pass on any runtime;
 * they are kept on disk as reference until a full E2E rewrite is approved.
 *
 * Requires the dev server on :3002 (`bun run dev`) and the dev DB seeds
 * (quick-login accounts). Run: `bun run test:e2e`.
 *
 * The quick-login click retries: in dev, a click that lands before React
 * hydration finishes is a dead click — that is a test-timing artifact, not an
 * app bug, so the harness absorbs it the way a human retrying would.
 */
import { afterAll, beforeAll, describe, expect, it, setDefaultTimeout } from "bun:test";
import { chromium, type Browser, type BrowserContext, type Page } from "@playwright/test";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3002";
// Dev mode compiles each route on FIRST visit; on a cold 2-core CI runner a
// portal walk pays that three times over, so the per-test budget must absorb
// several ~60s compiles — see the waitForURL note in the portal loop.
setDefaultTimeout(300_000);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let browser: Browser;
beforeAll(async () => {
  browser = await chromium.launch({ headless: true });
});
afterAll(async () => {
  await browser?.close();
});

/** Per-page console/error/network trail, dumped beside the failure shot. */
const pageTrail = new WeakMap<Page, string[]>();

async function freshPage(): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const trail: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error" || m.type() === "warning") trail.push(`[console.${m.type()}] ${m.text()}`);
  });
  page.on("pageerror", (e) => trail.push(`[pageerror] ${e.message}`));
  page.on("requestfailed", (r) =>
    trail.push(`[requestfailed] ${r.url()} — ${r.failure()?.errorText ?? "?"}`),
  );
  pageTrail.set(page, trail);
  return { ctx, page };
}

/**
 * First entry into a portal offers itself once: the guided tour (students,
 * parents — `user_prefs.tour_completed` is false on fresh seeds) or the
 * emulator first-run dialog (teacher/center). Both are DESIGNED to skip on
 * Esc and persist the dismissal, so pressing it is exactly what a human does
 * — and their backdrop otherwise swallows every nav click below it.
 */
async function dismissFirstRunOverlays(page: Page): Promise<void> {
  for (let i = 0; i < 3; i++) {
    const overlay = page
      .locator("[class*='guided-tour'][class*='dim'], [role=dialog][aria-modal=true], [role=menu]")
      .first();
    if (!(await overlay.isVisible({ timeout: 2_500 }).catch(() => false))) return;
    await page.keyboard.press("Escape");
    await overlay.waitFor({ state: "hidden", timeout: 5_000 }).catch(() => {});
    await sleep(400);
  }
}

/** Screenshot + full-page dump on failure, then rethrow. CI uploads the dir. */
async function runWithFailureShot(page: Page, name: string, body: () => Promise<void>): Promise<void> {
  try {
    await body();
  } catch (err) {
    const dir = "e2e-artifacts";
    await import("node:fs/promises").then((fs) => fs.mkdir(dir, { recursive: true }));
    await page.screenshot({ path: `${dir}/${name}.png`, fullPage: false }).catch(() => {});
    const html = await page.content().catch(() => "");
    await import("node:fs/promises")
      .then((fs) => fs.writeFile(`${dir}/${name}.html`, `<!-- ${page.url()} -->\n${html}`))
      .catch(() => {});
    const trail = pageTrail.get(page) ?? [];
    await import("node:fs/promises")
      .then((fs) => fs.writeFile(`${dir}/${name}.console.txt`, trail.join("\n") || "(no console errors, page errors, or failed requests recorded)"))
      .catch(() => {});
    throw err;
  }
}

async function quickLogin(page: Page, label: string): Promise<void> {
  await page.goto(`${BASE}/ar/login`, { waitUntil: "networkidle", timeout: 60_000 });
  await sleep(1200); // hydration
  for (let attempt = 1; attempt <= 4; attempt++) {
    // Re-click ONLY while still on the login page. On a slow runner the first
    // click's navigation can outlive the wait below; a blind second click then
    // finds the PORTAL's user chip — whose accessible name also contains the
    // role word («Demo Admin مسؤول») — and opens its menu, which as a Radix
    // popover swallows every nav click after it. (The blank-looking CI shots
    // with a fully-rendered DOM were exactly this.)
    if (new URL(page.url()).pathname.includes("/login")) {
      await page.getByRole("button", { name: label }).click({ timeout: 15_000 });
    }
    const arrived = await page
      .waitForURL("**/dashboard/**", { timeout: 30_000 })
      .then(() => true)
      .catch(() => false);
    if (arrived) return;
  }
  throw new Error(`quick-login "${label}" never reached a dashboard`);
}

describe("login page", () => {
  it("renders the Arabic sign-in form with quick-login tiles", async () => {
    const { ctx, page } = await freshPage();
    try {
      await page.goto(`${BASE}/ar/login`, { waitUntil: "networkidle", timeout: 60_000 });
      await page.locator("h1").first().waitFor({ state: "visible", timeout: 15_000 });
      expect(await page.locator("h1").first().textContent()).toContain("تسجيل الدخول");
      await page.getByPlaceholder("you@example.com").waitFor({ state: "visible" });
      for (const label of ["مسؤول", "مدرّس", "طالب", "ولي أمر"]) {
        await page.getByRole("button", { name: label }).waitFor({ state: "visible" });
      }
    } finally {
      await ctx.close();
    }
  });

  it("rejects invalid credentials with a visible error", async () => {
    const { ctx, page } = await freshPage();
    try {
      await page.goto(`${BASE}/ar/login`, { waitUntil: "networkidle", timeout: 60_000 });
      await sleep(1200);
      await page.getByPlaceholder("you@example.com").fill("nobody@example.com");
      await page.locator("input[type=password]").fill("wrongpassword");
      await page.getByRole("button", { name: "تسجيل الدخول" }).click();
      // The element carrying role=alert changed with the login redesign — what
      // matters is that SOME alert becomes visible, not its tag.
      await page.locator("[role=alert]").first().waitFor({ state: "visible", timeout: 15_000 });
      expect(page.url()).toContain("/login");
    } finally {
      await ctx.close();
    }
  });
});

describe("role portals", () => {
  const ROLES: Array<{ label: string; portal: string; routes: string[] }> = [
    // "checkin" became the counter board during the counter-board work — the
    // sidebar entry is /admin/counter now.
    { label: "مسؤول", portal: "/ar/dashboard/admin", routes: ["counter", "students", "fees"] },
    { label: "مدرّس", portal: "/ar/dashboard/teacher", routes: ["classes", "attendance", "wallet"] },
    { label: "طالب", portal: "/ar/dashboard/student", routes: ["subjects", "schedule", "wallet"] },
    { label: "ولي أمر", portal: "/ar/dashboard/parent", routes: ["children", "fees", "wallet"] },
  ];

  for (const role of ROLES) {
    it(`${role.portal} — quick-login lands on the portal and its nav works`, async () => {
      const { ctx, page } = await freshPage();
      try {
        // Screenshot on ANY failure below — uploaded as a CI artifact, because
        // "</html> intercepts pointer events" names the symptom, not the thing
        // sitting on top of the page.
        await runWithFailureShot(page, role.portal.split("/").pop()!, async () => {
        await quickLogin(page, role.label);
        expect(new URL(page.url()).pathname).toStartWith(role.portal);
        await sleep(2500);
        await dismissFirstRunOverlays(page);
        for (const seg of role.routes) {
          // Real click on the portal nav; retry once — see hydration note above.
          // WAIT for the URL rather than sampling it after a fixed sleep: in
          // dev mode the first visit to a route compiles it, which on a cold
          // CI runner takes tens of seconds — a 2s sample reads the OLD url
          // and fails a navigation that was merely still compiling.
          let arrived = false;
          const links = page.locator(`a[href*='${role.portal}/${seg}']`);
          for (let attempt = 1; attempt <= 2 && !arrived; attempt++) {
            await links.first().click({ timeout: 15_000 });
            arrived = await page
              .waitForURL(`**${role.portal}/${seg}**`, { timeout: 60_000 })
              .then(() => true)
              .catch(() => false);
          }
          if (!arrived) {
            // A clicked link that navigates nowhere twice needs facts, not a
            // stack trace: how many elements matched, which were visible, and
            // whether anything modal sat above them at that moment.
            const n = await links.count();
            const vis: string[] = [];
            for (let i = 0; i < Math.min(n, 4); i++) {
              const l = links.nth(i);
              vis.push(
                `#${i} visible=${await l.isVisible().catch(() => "?")} box=${JSON.stringify(await l.boundingBox().catch(() => null))}`,
              );
            }
            console.error(
              `[e2e-diag] ${role.portal}/${seg}: url=${page.url()} matches=${n} | ${vis.join(" | ")}` +
                ` | modals=${await page.locator("[role=dialog][aria-modal=true]").count()}` +
                ` | dims=${await page.locator("[class*='guided-tour'][class*='dim']").count()}`,
            );
          }
          expect(new URL(page.url()).pathname).toContain(seg);
        }
        // the page must still be responsive (regression guard for the 2026-07-30
        // infinite-render freeze)
        expect(await page.evaluate(() => 1 + 1)).toBe(2);
        });
      } finally {
        await ctx.close();
      }
    });
  }
});

describe("auth boundary", () => {
  it("an unauthenticated visitor cannot stay on a portal route", async () => {
    const { ctx, page } = await freshPage();
    try {
      await page.goto(`${BASE}/ar/dashboard/admin`, { waitUntil: "networkidle", timeout: 60_000 });
      // client guard bounces to login once identity resolves as absent
      let onLogin = false;
      for (let i = 0; i < 20 && !onLogin; i++) {
        await sleep(1000);
        onLogin = page.url().includes("/login");
      }
      expect(onLogin).toBe(true);
    } finally {
      await ctx.close();
    }
  });
});
