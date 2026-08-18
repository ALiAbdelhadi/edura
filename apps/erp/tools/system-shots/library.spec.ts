/**
 * THE LIBRARY — the 22 extra screens approved in INVENTORY.md §11.
 *
 * Deliberately NOT the curated nineteen. These land in
 * `apps/www/public/system/library/`, which nothing in the site reads: the
 * manifest is the only way an image reaches a page, and no library file is in
 * it. That separation is the point — a library is a set of choices somebody can
 * make later, not a set of images that quietly started shipping.
 *
 * The selection rule was "a shot earns its place only if it proves something
 * the curated nineteen do not", which is why there is no `/messages`,
 * `/notifications`, `/settings` or `/notes` here. Those are the same two
 * components repeated per portal, and photographing them eight times each is
 * thirty files that say one thing. Full reasoning: INVENTORY.md §11.
 *
 * Run:  PLAYWRIGHT_BROWSERS_PATH=0 npx playwright test \
 *         --config=tools/system-shots/playwright.config.ts -g "library"
 *       tools/system-shots/optimise.sh
 */
import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const RAW = path.join(process.cwd(), "tools", "system-shots", "raw", "library");
const PASSWORD = "Passw0rd!";
const DESKTOP = { width: 1440, height: 900 };
const PHONE = { width: 390, height: 844 };

const A = {
  centerOwner: "showcasedemo-marwan@edura.test",
  extCenterOwner: "extdemo-mona@edura.test",
  teacher: "showcasedemo-hossam@edura.test",
  staffReception: "showcasedemo-laila@edura.test",
  parent: "paydemo.sami@edura.demo",
  student: "showcasedemo-student-1@edura.test",
};

/** A real showcase student id, discovered by the probe rather than guessed. */
const SHOWCASE_STUDENT_ID = "08b929d8-c147-569d-a426-7640dcb0c611";

const FORBIDDEN = ["tarekaboelnasr999", "tarekaccountant", "accountant@edura.eg", "ghost-user-9x"];

async function assertNoRealPeople(page: Page, slot: string) {
  const body = (await page.locator("body").innerText()).toLowerCase();
  for (const needle of FORBIDDEN) {
    expect(body.includes(needle.toLowerCase()), `${slot}: "${needle}" is on screen`).toBe(false);
  }
}

async function hideDevBadge(page: Page) {
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" }).catch(() => {});
}

async function warmGoto(page: Page, url: string) {
  for (let i = 0; i < 4; i++) {
    const res = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90_000 }).catch(() => null);
    if (res?.ok()) return;
    await page.waitForTimeout(2500);
  }
  throw new Error(`route never returned ok: ${url}`);
}

async function signIn(page: Page, email: string) {
  await warmGoto(page, "/ar/login");
  await page.waitForLoadState("networkidle").catch(() => {});
  const emailBox = page.getByRole("textbox").first();
  const passBox = page.locator('input[type="password"]');
  await emailBox.waitFor({ state: "visible", timeout: 30_000 });
  // The form is a client component: filling before hydration sets a value that
  // hydration then discards. Read it back rather than trusting the fill.
  for (let i = 0; i < 4; i++) {
    await emailBox.fill(email);
    await passBox.fill(PASSWORD);
    await page.waitForTimeout(400);
    if ((await emailBox.inputValue()) === email) break;
  }
  await page.getByRole("button", { name: /sign in|تسجيل الدخول/i }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 45_000 });
  await page
    .evaluate(async () => {
      await fetch("/api/v1/me/prefs", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tourCompleted: true }),
      });
    })
    .catch(() => {});
}

/**
 * Waits for content, never for a guessed delay.
 *
 * `rows` is the important option: several of these screens render their heading
 * and a chart immediately, then fetch the list behind a spinner that carries no
 * `animate-pulse` class. Matching on heading text alone photographed loading
 * circles twice during Phase 2, so a screen whose value IS its list waits for
 * the list.
 */
async function settle(page: Page, opts: { expect?: RegExp; rows?: number } = {}) {
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.evaluate(() => document.fonts.ready).catch(() => {});
  if (opts.expect) {
    await expect(page.locator("main")).toContainText(opts.expect, { timeout: 45_000 });
  }
  if (opts.rows) {
    await expect
      .poll(async () => page.locator("main tbody tr, main li[class], main [data-slot='card']").count(), {
        timeout: 45_000,
      })
      .toBeGreaterThanOrEqual(opts.rows);
  }
  await page
    .waitForFunction(() => document.querySelectorAll(".animate-pulse").length === 0, null, {
      timeout: 20_000,
    })
    .catch(() => {});
  await page.waitForTimeout(600);
  await hideDevBadge(page);
  await page
    .addStyleTag({ content: "[data-sonner-toaster], [data-sonner-toast] { opacity: 0 !important; }" })
    .catch(() => {});
}

async function shoot(page: Page, slot: string) {
  fs.mkdirSync(RAW, { recursive: true });
  await assertNoRealPeople(page, slot);
  await page.screenshot({
    path: path.join(RAW, `${slot}.png`),
    animations: "disabled",
    caret: "hide",
  });
  // eslint-disable-next-line no-console
  console.log(`lib ${slot}`);
}

/* ══ CENTER PORTAL ════════════════════════════════════════════════════════ */

test.describe("library · center", () => {
  test.use({ viewport: DESKTOP, colorScheme: "light", locale: "ar-EG" });

  test("center screens", async ({ page }) => {
    test.setTimeout(15 * 60_000);
    await signIn(page, A.centerOwner);

    await warmGoto(page, "/ar/dashboard/admin/students");
    await settle(page, { expect: /الطلاب/, rows: 6 });
    await shoot(page, "admin-students");

    await warmGoto(page, `/ar/dashboard/admin/students/${SHOWCASE_STUDENT_ID}`);
    await settle(page, { rows: 3 });
    await shoot(page, "admin-students-detail");

    await warmGoto(page, "/ar/dashboard/admin/teachers");
    await settle(page, { expect: /المدرّسون/, rows: 2 });
    await shoot(page, "admin-teachers");

    await warmGoto(page, "/ar/dashboard/admin/classes");
    await settle(page, { expect: /الفصول/, rows: 2 });
    await shoot(page, "admin-classes");

    await warmGoto(page, "/ar/dashboard/admin/fees");
    await settle(page, { expect: /الرسوم/ });
    await shoot(page, "admin-fees");

    await warmGoto(page, "/ar/dashboard/admin/expenses");
    await settle(page, { expect: /المصروفات/, rows: 3 });
    await shoot(page, "admin-expenses");

    await warmGoto(page, "/ar/dashboard/admin/audit");
    await settle(page, { expect: /سجل التدقيق/ });
    await shoot(page, "admin-audit");

    await warmGoto(page, "/ar/dashboard/admin/checkin");
    await settle(page);
    await shoot(page, "admin-checkin");
  });

  test("external teachers", async ({ page }) => {
    test.setTimeout(10 * 60_000);
    // A DIFFERENT CENTER on purpose — `extdemo` is the only one that runs
    // teachers who are not on the platform, which is what these two screens
    // are for. The showcase center's copies are empty.
    await signIn(page, A.extCenterOwner);

    await warmGoto(page, "/ar/dashboard/admin/external-teachers");
    await settle(page, { expect: /مدرّسون خارج النظام/, rows: 2 });
    await shoot(page, "admin-external-teachers");

    await warmGoto(page, "/ar/dashboard/admin/external-teachers/gaps");
    await settle(page, { expect: /مدرّسون خارج النظام/, rows: 6 });
    await shoot(page, "admin-external-teachers-gaps");
  });
});

/* ══ TEACHER PORTAL ═══════════════════════════════════════════════════════ */

test.describe("library · teacher", () => {
  test.use({ viewport: DESKTOP, colorScheme: "light", locale: "ar-EG" });

  test("teacher screens", async ({ page }) => {
    test.setTimeout(15 * 60_000);
    await signIn(page, A.teacher);

    await warmGoto(page, "/ar/dashboard/teacher/classes");
    await settle(page, { expect: /فصولي/, rows: 6 });
    await shoot(page, "teacher-classes");

    await warmGoto(page, "/ar/dashboard/teacher/grades");
    await settle(page, { expect: /سجل الدرجات/ });
    await shoot(page, "teacher-grades");

    await warmGoto(page, "/ar/dashboard/teacher/materials");
    await settle(page, { expect: /الملفات التعليمية/ });
    await shoot(page, "teacher-materials");

    await warmGoto(page, "/ar/dashboard/teacher/team");
    await settle(page, { expect: /الفريق/ });
    await shoot(page, "teacher-team");

    // The teacher's own door screen — the fallback when no assistant is on the
    // hall. Reachable only because this teacher is `counter_and_door`.
    await warmGoto(page, "/ar/dashboard/teacher/door");
    await settle(page, { expect: /حصص اليوم/ });
    const lesson = page.locator("main button").filter({ hasText: /—/ }).first();
    if (await lesson.count()) {
      await lesson.click();
      await expect
        .poll(async () => page.getByRole("button", { name: /تأكيد/ }).count(), { timeout: 45_000 })
        .toBeGreaterThan(1);
      await page.waitForTimeout(500);
    }
    await shoot(page, "teacher-door");
  });
});

/* ══ STAFF PORTAL ═════════════════════════════════════════════════════════ */

test.describe("library · staff", () => {
  test.use({ viewport: DESKTOP, colorScheme: "light", locale: "ar-EG" });

  test("staff checkin", async ({ page }) => {
    test.setTimeout(10 * 60_000);
    // The RECEPTIONIST, because the counter is front-desk work and this is the
    // account that actually does it.
    await signIn(page, A.staffReception);
    await warmGoto(page, "/ar/dashboard/staff/checkin");
    await settle(page);
    await shoot(page, "staff-checkin");
  });
});

/* ══ PARENT PORTAL ════════════════════════════════════════════════════════ */

test.describe("library · parent", () => {
  test.use({ viewport: DESKTOP, colorScheme: "light", locale: "ar-EG" });

  test("parent oversight", async ({ page }) => {
    test.setTimeout(10 * 60_000);
    await signIn(page, A.parent);
    await warmGoto(page, "/ar/dashboard/parent/oversight");
    await settle(page, { expect: /سلامة الأبناء/ });
    await shoot(page, "parent-oversight");
  });
});

test.describe("library · parent phone", () => {
  test.use({ viewport: PHONE, colorScheme: "light", locale: "ar-EG", isMobile: true, hasTouch: true });

  test("parent children phone", async ({ page }) => {
    test.setTimeout(10 * 60_000);
    await signIn(page, A.parent);
    await warmGoto(page, "/ar/dashboard/parent/children");
    await settle(page, { expect: /الأبناء/ });
    await shoot(page, "parent-children-phone");
  });
});

/* ══ STUDENT PORTAL ═══════════════════════════════════════════════════════ */

test.describe("library · student", () => {
  test.use({ viewport: DESKTOP, colorScheme: "light", locale: "ar-EG" });

  test("student family", async ({ page }) => {
    test.setTimeout(10 * 60_000);
    await signIn(page, A.student);
    await warmGoto(page, "/ar/dashboard/student/family");
    await settle(page, { expect: /رمز العائلة/ });
    await shoot(page, "student-family");
  });
});

test.describe("library · student phone", () => {
  test.use({ viewport: PHONE, colorScheme: "light", locale: "ar-EG", isMobile: true, hasTouch: true });

  test("student phone screens", async ({ page }) => {
    test.setTimeout(12 * 60_000);
    await signIn(page, A.student);

    await warmGoto(page, "/ar/dashboard/student/schedule");
    await settle(page, { expect: /الجدول/ });
    await shoot(page, "student-schedule-phone");

    await warmGoto(page, "/ar/dashboard/student/grades");
    await settle(page, { expect: /الدرجات/ });
    await shoot(page, "student-grades-phone");

    await warmGoto(page, "/ar/dashboard/student/wallet");
    await settle(page, { expect: /المحفظة/ });
    await shoot(page, "student-wallet-phone");
  });
});
