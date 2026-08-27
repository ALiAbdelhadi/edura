/// <reference types="bun" />
import { afterAll, beforeAll, describe, expect, it, setDefaultTimeout } from "bun:test";
import { chromium, type Browser, type BrowserContext, type Page } from "@playwright/test";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3002";
setDefaultTimeout(300_000);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let browser: Browser;
beforeAll(async () => {
  browser = await chromium.launch({ headless: true });
});
afterAll(async () => {
  await browser?.close();
});

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
      await page.locator("[role=alert]").first().waitFor({ state: "visible", timeout: 15_000 });
      expect(page.url()).toContain("/login");
    } finally {
      await ctx.close();
    }
  });
});

describe("role portals", () => {
  const ROLES: Array<{ label: string; portal: string; routes: string[] }> = [
    { label: "مسؤول", portal: "/ar/dashboard/admin", routes: ["counter", "students", "fees"] },
    { label: "مدرّس", portal: "/ar/dashboard/teacher", routes: ["classes", "attendance", "wallet"] },
    { label: "طالب", portal: "/ar/dashboard/student", routes: ["subjects", "schedule", "wallet"] },
    { label: "ولي أمر", portal: "/ar/dashboard/parent", routes: ["children", "fees", "wallet"] },
  ];

  for (const role of ROLES) {
    it(`${role.portal} — quick-login lands on the portal and its nav works`, async () => {
      const { ctx, page } = await freshPage();
      try {
        await runWithFailureShot(page, role.portal.split("/").pop()!, async () => {
        await quickLogin(page, role.label);
        expect(new URL(page.url()).pathname).toStartWith(role.portal);
        await sleep(2500);
        await dismissFirstRunOverlays(page);
        for (const seg of role.routes) {
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
