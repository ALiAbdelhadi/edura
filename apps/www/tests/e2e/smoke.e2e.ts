/**
 * E2E smoke suite — bun test + the playwright LIBRARY, no Node anywhere.
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
setDefaultTimeout(120_000);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let browser: Browser;
beforeAll(async () => {
  browser = await chromium.launch({ headless: true });
});
afterAll(async () => {
  await browser?.close();
});

async function freshPage(): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  return { ctx, page: await ctx.newPage() };
}

async function quickLogin(page: Page, label: string): Promise<void> {
  await page.goto(`${BASE}/ar/login`, { waitUntil: "networkidle", timeout: 60_000 });
  await sleep(1200); // hydration
  for (let attempt = 1; attempt <= 4; attempt++) {
    await page.getByRole("button", { name: label }).click({ timeout: 15_000 });
    const arrived = await page
      .waitForURL("**/dashboard/**", { timeout: 20_000 })
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
      for (const label of ["مسؤول", "معلم", "طالب", "ولي أمر"]) {
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
      await page.locator("p[role=alert]").waitFor({ state: "visible", timeout: 15_000 });
      expect(page.url()).toContain("/login");
    } finally {
      await ctx.close();
    }
  });
});

describe("role portals", () => {
  const ROLES: Array<{ label: string; portal: string; routes: string[] }> = [
    { label: "مسؤول", portal: "/ar/dashboard/admin", routes: ["checkin", "students", "fees"] },
    { label: "معلم", portal: "/ar/dashboard/teacher", routes: ["classes", "attendance", "wallet"] },
    { label: "طالب", portal: "/ar/dashboard/student", routes: ["subjects", "schedule", "wallet"] },
    { label: "ولي أمر", portal: "/ar/dashboard/parent", routes: ["children", "fees", "wallet"] },
  ];

  for (const role of ROLES) {
    it(`${role.portal} — quick-login lands on the portal and its nav works`, async () => {
      const { ctx, page } = await freshPage();
      try {
        await quickLogin(page, role.label);
        expect(new URL(page.url()).pathname).toStartWith(role.portal);
        await sleep(2500);
        for (const seg of role.routes) {
          // Real click on the portal nav; retry once — see hydration note above.
          for (let attempt = 1; attempt <= 2; attempt++) {
            await page
              .locator(`a[href*='${role.portal}/${seg}']`)
              .first()
              .click({ timeout: 10_000 });
            await sleep(2000);
            if (new URL(page.url()).pathname.includes(seg)) break;
          }
          expect(new URL(page.url()).pathname).toContain(seg);
        }
        // the page must still be responsive (regression guard for the 2026-07-30
        // infinite-render freeze)
        expect(await page.evaluate(() => 1 + 1)).toBe(2);
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
