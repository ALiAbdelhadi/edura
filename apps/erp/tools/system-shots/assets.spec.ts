/**
 * THE CURATED NINETEEN — the shots apps/www is already built around.
 *
 * Every slot in `apps/www/docs/ASSETS.md`, captured from the real dev server as
 * a real signed-in role, in the exact state that document specifies. Raw 2x
 * PNGs land in `tools/system-shots/raw/`; `optimise.sh` turns them into the
 * WebP files under `apps/www/public/system/`, whose stems are the manifest ids.
 *
 * Run:  bun run --cwd apps/erp dev            # :3002, in another terminal
 *       bun --env-file=.env --cwd packages/database prisma/showcase-live-demo-seed.ts
 *       PLAYWRIGHT_BROWSERS_PATH=0 npx playwright test \
 *         --config=tools/system-shots/playwright.config.ts -g "capture"
 *       tools/system-shots/optimise.sh
 *
 * THE SAFETY RULE OVERRIDES EVERYTHING HERE: no real person may appear. Every
 * account below is `is_demo`, and `assertNoRealPeople` fails the capture if a
 * known-real identifier reaches the DOM. Blurring is not the method.
 */
import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const RAW = path.join(process.cwd(), "tools", "system-shots", "raw");
const PASSWORD = "Passw0rd!";

const DESKTOP = { width: 1440, height: 900 };
const PHONE = { width: 390, height: 844 };
/** `settlement-confirm` is the one 4:3 slot — see the manifest's ASPECT_STILL. */
const STILL = { width: 1120, height: 840 };

const A = {
  centerOwner: "showcasedemo-marwan@edura.test",
  teacher: "showcasedemo-hossam@edura.test",
  assistant: "showcasedemo-nour@edura.test",
  staffManager: "showcasedemo-tarek@edura.test",
  staffReception: "showcasedemo-laila@edura.test",
  parent: "paydemo.sami@edura.demo",
  /**
   * A SHOWCASE student, not `lina.hassan@student.nile-academy.eg`.
   *
   * Lina's profile is 2-of-4 complete, so `/dashboard/student/id` renders
   * "بياناتك لسه مش مكتملة، فالبطاقة لسه ما اتصدرتش" — a refusal, not a card.
   * The showcase students carry a guardian email and a grade (phone is
   * non-blocking), so `cardAvailable` is true and the card really issues. It
   * also keeps the student on the same center as every other plate.
   */
  student: "showcasedemo-student-1@edura.test",
  counterOwner: "counterdemo-hoda@edura.test",
};

/**
 * Strings that must NEVER reach a marketing image. The real operator account
 * is on this database, and a screenshot is the easiest place in a company to
 * leak one.
 */
const FORBIDDEN = [
  "tarekaboelnasr999",
  "tarekaccountant",
  "accountant@edura.eg",
  "ghost-user-9x",
];

async function assertNoRealPeople(page: Page, slot: string) {
  const body = (await page.locator("body").innerText()).toLowerCase();
  for (const needle of FORBIDDEN) {
    expect(body.includes(needle.toLowerCase()), `${slot}: "${needle}" is on screen`).toBe(false);
  }
}

/** The dev badge is a fixed overlay that also intercepts clicks. */
async function hideDevBadge(page: Page) {
  await page
    .addStyleTag({ content: "nextjs-portal { display: none !important; }" })
    .catch(() => {});
}

/** A cold `next dev` compiles on first request; never swallow the failure. */
async function warmGoto(page: Page, url: string) {
  for (let i = 0; i < 4; i++) {
    const res = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90_000 }).catch(() => null);
    if (res?.ok()) return;
    await page.waitForTimeout(2500);
  }
  throw new Error(`route never returned ok: ${url}`);
}

/**
 * Signs in and CHECKS THE FIELDS KEPT THEIR VALUE — the login form is a client
 * component, and filling it before hydration sets a DOM value that hydration
 * then throws away, leaving "البريد الإلكتروني مطلوب" over a field that
 * visibly had text in it.
 */
async function signIn(page: Page, email: string) {
  await warmGoto(page, "/ar/login");
  await page.waitForLoadState("networkidle").catch(() => {});
  const emailBox = page.getByRole("textbox").first();
  const passBox = page.locator('input[type="password"]');
  await emailBox.waitFor({ state: "visible", timeout: 30_000 });
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
 * Waits for the screen's own content instead of a guessed delay.
 *
 * These screens fetch AFTER paint — a timed wait photographs skeletons, which
 * is exactly what happened on the first manual pass. Fonts are `display: swap`,
 * so the display face lands after first paint and every heading changes height;
 * `document.fonts.ready` is what makes the measurement stable.
 */
async function settle(page: Page, opts: { expect?: string | RegExp } = {}) {
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.evaluate(() => document.fonts.ready).catch(() => {});
  if (opts.expect) {
    await expect(page.locator("main")).toContainText(opts.expect, { timeout: 45_000 });
  }
  // Skeletons carry an animate-pulse class in this codebase; wait them out.
  await page
    .waitForFunction(() => document.querySelectorAll(".animate-pulse").length === 0, null, {
      timeout: 20_000,
    })
    .catch(() => {});
  await page.waitForTimeout(700);
  await hideDevBadge(page);
}

/**
 * Clears anything transient floating over the page.
 *
 * A saved-attendance toast landed in the middle of the first `settlement-confirm`
 * capture. ASSETS.md names open toasts as a thing to check for — they date the
 * image, and a toast can name a person.
 */
async function clearOverlays(page: Page) {
  // HIDDEN WITH CSS, NEVER REMOVED FROM THE DOM.
  //
  // The first version called `node.remove()` on the sonner toaster. Those nodes
  // belong to React, and tearing them out from under it threw on the next
  // reconciliation and unmounted the subtree — so the settle card disappeared
  // AFTER its text had already been asserted, and both teacher captures then
  // sat waiting twelve minutes for a card that no longer existed. A stylesheet
  // changes what is photographed without touching what React owns.
  await page
    .addStyleTag({
      content: "[data-sonner-toaster], [data-sonner-toast] { opacity: 0 !important; }",
    })
    .catch(() => {});
  await page.waitForTimeout(200);
}

/**
 * Dismisses the center's first-run checklist.
 *
 * Once every step is ticked it becomes a large "خلّصت الخطوات كلها" panel with
 * five struck-through lines, and it occupies the top third of the board —
 * pushing the two numbers a center owner actually opens the app for
 * (takings, arrears) below the fold. It is a first-run artifact, not the
 * steady-state screen the slot is meant to show.
 */
async function dismissChecklist(page: Page) {
  const panel = page.locator("main").getByText(/خلّصت الخطوات كلها|خطواتك الأولى/).first();
  if (!(await panel.count())) return;
  const card = panel.locator("xpath=ancestor-or-self::*[@data-slot='card'][1]");
  const x = card.locator("button").first();
  if (await x.count()) {
    await x.click({ timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(1200);
  }
}

async function shoot(page: Page, slot: string, clip?: { x: number; y: number; width: number; height: number }) {
  fs.mkdirSync(RAW, { recursive: true });
  await assertNoRealPeople(page, slot);
  await page.screenshot({
    path: path.join(RAW, `${slot}.png`),
    animations: "disabled",
    caret: "hide",
    ...(clip ? { clip } : {}),
  });
  // eslint-disable-next-line no-console
  console.log(`shot ${slot}`);
}

/* ══ THE CENTER ═══════════════════════════════════════════════════════════ */

test.describe("capture · center", () => {
  test.use({ viewport: DESKTOP, colorScheme: "light", locale: "ar-EG" });

  test("role-center + center-money + center-ops", async ({ page }) => {
    test.setTimeout(10 * 60_000);
    await signIn(page, A.centerOwner);

    await warmGoto(page, "/ar/dashboard/admin");
    await settle(page, { expect: /إجمالي الإيرادات/ });
    await dismissChecklist(page);
    await shoot(page, "role-center");

    await warmGoto(page, "/ar/dashboard/admin/reports");
    await settle(page, { expect: /صافي الربح/ });
    await shoot(page, "center-money");

    await warmGoto(page, "/ar/dashboard/admin/schedule");
    await settle(page, { expect: /جدول الحصص/ });
    await shoot(page, "center-ops");
  });

  test("center-counter", async ({ page }) => {
    test.setTimeout(10 * 60_000);
    // The counter-demo center, not the showcase one: it is the only fixture
    // seeded with a lesson STRADDLING THIS MINUTE and a roster nobody has
    // checked in yet, which is the state the board exists to resolve.
    await signIn(page, A.counterOwner);
    await warmGoto(page, "/ar/dashboard/admin/counter");
    await settle(page, { expect: /لم يسجّلوا|سجّلوا الحضور/ });

    // SELECT THE "NOT YET CHECKED IN" TAB.
    //
    // The board opens on "سجّلوا الحضور", which at the start of a shift is
    // empty — so the default frame is the words "لم يسجّل أحد الحضور بعد" over
    // blank space, while the eight students the shift is about sit on the other
    // tab. ASSETS.md calls this slot "a still of the roster", and the roster is
    // there.
    const pending = page.getByRole("tab", { name: /لم يسجّلوا/ });
    await pending.click();
    await expect
      .poll(async () => page.locator("main tbody tr, main li").count(), { timeout: 30_000 })
      .toBeGreaterThan(3);
    await page.waitForTimeout(600);
    await shoot(page, "center-counter");
    // The clip's poster comes from the same frame, so the still and the moving
    // image cannot disagree about what the board looks like.
    await shoot(page, "counter-board-poster");
  });
});

/* ══ THE PERMISSION TIER — two halves of one plate ════════════════════════ */

test.describe("capture · center-team", () => {
  test.use({ viewport: DESKTOP, colorScheme: "light", locale: "ar-EG" });

  /**
   * ONE shot, the MANAGER's — the two-tier composition was tried and dropped.
   *
   * The plan was the same URL twice, manager and receptionist, stacked. Two
   * things killed it. Geometry: the manifest reserves 16/10 for this slot, and
   * two stacked 1440x900 frames are 0.8, so landing it would have changed the
   * plate's shape — the one thing the manifest exists to prevent. Content: the
   * receptionist does not get a REFUSAL on that route, she gets a permanent
   * "جارٍ التحميل…" shell (see INVENTORY.md §9), so the bottom half was a
   * screenshot of a spinner.
   *
   * The manager's own screen states the tier in its subtitle anyway —
   * "كل ما يستطيعه موظف الاستقبال، بالإضافة إلى إدارة القاعات وطلبات التعاون
   * والتقارير التشغيلية" — which is the permission tiers legible in one frame,
   * at the right aspect ratio, with no compositing.
   */
  test("center-team", async ({ page }) => {
    test.setTimeout(10 * 60_000);
    await signIn(page, A.staffManager);
    await warmGoto(page, "/ar/dashboard/staff/reports");
    await settle(page, { expect: /التقارير التشغيلية/ });
    await shoot(page, "center-team");
  });
});

/* ══ THE TEACHER ══════════════════════════════════════════════════════════ */

/**
 * Drives the register until the split is quoted, and STOPS THERE.
 *
 * `settlement-confirm` is the two-step confirm BEFORE a lesson closes, so the
 * final button is deliberately never pressed: pressing it would write 423 ج.م
 * to an append-only ledger for a screenshot. Marking attendance is a normal,
 * repeatable write; distributing money is not.
 */
async function openSettlePreview(page: Page) {
  await warmGoto(page, "/ar/dashboard/teacher/attendance");
  await settle(page, { expect: /تسجيل الحضور/ });

  const firstRow = page.locator("main tbody tr").first();
  await firstRow.getByRole("button", { name: "تسجيل الحضور" }).click();
  await settle(page, { expect: /توزيع الجلسة/ });

  // Mark everyone present, then SAVE — the preview reads the server, not the
  // unsaved form, so an unsaved register quotes "مفيش طلاب حاضرين".
  const rows = page.locator("main tbody tr");
  const n = await rows.count();
  for (let i = 0; i < n; i++) {
    const btn = rows.nth(i).getByRole("button", { name: "حاضر", exact: true });
    if (await btn.count()) await btn.first().click();
  }
  await page.getByRole("button", { name: "حفظ الحضور" }).click();
  await page.waitForTimeout(3000);

  await expect(page.locator("main")).toContainText(/نصيب كل طرف عن الطالب الواحد/, {
    timeout: 45_000,
  });
  await clearOverlays(page);
}

/** The settle card itself, by its own card boundary rather than by xpath depth.
 *  An `ancestor::div[3]` guess resolved to the attendance chart on the first
 *  run, so `settlement-confirm` shipped a picture of a bar chart. */
function settleCard(page: Page) {
  return page
    .locator('[data-slot="card"]')
    .filter({ hasText: "إقفال الحصة وتوزيع حصيلتها" })
    .last();
}

test.describe("capture · teacher", () => {
  test.use({ viewport: DESKTOP, colorScheme: "light", locale: "ar-EG" });

  /**
   * ONE FILE, SHARED BY TWO SLOTS — `roleTeacher` and `teacherTeaching` both
   * point at `teacher-teaching.webp` in the manifest.
   *
   * ASSETS.md defines `role-teacher` as "the same claim as settlement-confirm
   * but from the teacher's side of the desk", and `teacher-teaching` as the
   * register with the close-lesson preview showing the split. That is one
   * screen described twice. Two attempts to force a visible difference by
   * scroll position produced BYTE-IDENTICAL files, because the page is not tall
   * enough for two distinct 1440x900 frames — both target offsets clamp to the
   * same maximum scroll, which an assertion here caught rather than shipping.
   *
   * Sharing the file is the honest outcome: no invented difference, no
   * duplicate weight on an Egyptian mobile connection, and the two slots
   * genuinely want the same picture. `settlement-confirm` is the tight 4:3 crop
   * of the same moment and remains its own file, because there the figures have
   * to be readable at 22rem.
   */
  test("teacher-teaching", async ({ page }) => {
    test.setTimeout(12 * 60_000);
    await signIn(page, A.teacher);
    await openSettlePreview(page);

    const card = settleCard(page);
    await card.scrollIntoViewIfNeeded();
    await clearOverlays(page);
    await page.waitForTimeout(700);
    await shoot(page, "teacher-teaching");
  });

  test("teacher-manage + teacher-wallet", async ({ page }) => {
    test.setTimeout(10 * 60_000);
    await signIn(page, A.teacher);

    await warmGoto(page, "/ar/dashboard/teacher/centers");
    await settle(page, { expect: /طلبات التعاون/ });
    await shoot(page, "teacher-manage");

    await warmGoto(page, "/ar/dashboard/teacher/wallet");
    await settle(page, { expect: /رصيد المحفظة/ });
    await shoot(page, "teacher-wallet");
  });
});

test.describe("capture · settlement-confirm", () => {
  test.use({ viewport: STILL, colorScheme: "light", locale: "ar-EG" });

  test("settlement-confirm", async ({ page }) => {
    test.setTimeout(12 * 60_000);
    await signIn(page, A.teacher);
    await openSettlePreview(page);

    // Clipped to the card itself: at 22rem wide in the money section, a full
    // page would render these figures unreadable, and the figures ARE the shot.
    const card = settleCard(page);
    await card.scrollIntoViewIfNeeded();
    await page.waitForTimeout(600);
    await clearOverlays(page);
    await expect(card).toContainText(/المدرّس/);

    const box = await card.boundingBox();
    if (!box) throw new Error("settle card has no box — nothing to clip to");
    const pad = 20;
    await shoot(page, "settlement-confirm", {
      x: Math.max(0, box.x - pad),
      y: Math.max(0, box.y - pad),
      width: Math.min(STILL.width - Math.max(0, box.x - pad), box.width + pad * 2),
      height: Math.min(STILL.height - Math.max(0, box.y - pad), box.height + pad * 2),
    });
  });
});

/* ══ THE PARENT ═══════════════════════════════════════════════════════════ */

test.describe("capture · parent desktop", () => {
  test.use({ viewport: DESKTOP, colorScheme: "light", locale: "ar-EG" });

  test("role-parent + parent-children", async ({ page }) => {
    test.setTimeout(10 * 60_000);
    await signIn(page, A.parent);

    // ASSETS.md asks for the parent paying, with the child selector visible.
    // `/pay` cannot be driven past its first step — its "كل المواد" tab is
    // inert and the fixture's course is outside the child's catalog subjects
    // (see INVENTORY.md §9) — so the money surface that IS real is `/fees`:
    // the same child selector, over actual payments and a receipt.
    await warmGoto(page, "/ar/dashboard/parent/fees");
    await settle(page, { expect: /صافي المدفوع/ });
    await shoot(page, "role-parent");

    await warmGoto(page, "/ar/dashboard/parent/children");
    await settle(page);
    await shoot(page, "parent-children");
  });
});

test.describe("capture · parent phone", () => {
  test.use({ viewport: PHONE, colorScheme: "light", locale: "ar-EG", isMobile: true, hasTouch: true });

  test("parent-pay", async ({ page }) => {
    test.setTimeout(10 * 60_000);
    await signIn(page, A.parent);
    await warmGoto(page, "/ar/dashboard/parent/pay");
    await settle(page, { expect: /ادفع لدرس/ });
    await shoot(page, "parent-pay");
  });
});

/* ══ THE STUDENT ══════════════════════════════════════════════════════════ */

test.describe("capture · student desktop", () => {
  test.use({ viewport: DESKTOP, colorScheme: "light", locale: "ar-EG" });

  test("role-student", async ({ page }) => {
    test.setTimeout(10 * 60_000);
    await signIn(page, A.student);
    await warmGoto(page, "/ar/dashboard/student/subjects");
    await settle(page, { expect: /المواد الدراسية/ });
    await shoot(page, "role-student");
  });
});

test.describe("capture · student phone", () => {
  test.use({ viewport: PHONE, colorScheme: "light", locale: "ar-EG", isMobile: true, hasTouch: true });

  test("student-learn + student-card", async ({ page }) => {
    test.setTimeout(10 * 60_000);
    await signIn(page, A.student);

    await warmGoto(page, "/ar/dashboard/student/subjects");
    await settle(page, { expect: /المواد الدراسية/ });
    await shoot(page, "student-learn");

    await warmGoto(page, "/ar/dashboard/student/id");
    await settle(page, { expect: /بطاقتي/ });

    // The card is deliberately NOT fetched with the page — the ON-DEMAND READS
    // rule means a screen spends no query on something the reader has not asked
    // to see, so it renders "بطاقتك مش بتتحمّل تلقائياً" behind a button. The
    // slot needs the code and the QR, so the button has to be pressed.
    const reveal = page.getByRole("button", { name: /أظهر البطاقة/ });
    await reveal.click({ timeout: 15_000 });
    await settle(page);
    // The eight-character code is the slot's whole point; if it is not on
    // screen this is a picture of a button. It renders GROUPED — `G3N1-PS99` —
    // so the pattern has to allow the separator the UI adds for readability.
    await expect(page.locator("main")).toContainText(/[A-Z0-9]{4}-[A-Z0-9]{4}/, {
      timeout: 30_000,
    });
    await shoot(page, "student-card");
  });
});

/* ══ THE ASSISTANT ════════════════════════════════════════════════════════ */

test.describe("capture · assistant desktop", () => {
  test.use({ viewport: DESKTOP, colorScheme: "light", locale: "ar-EG" });

  test("role-assistant", async ({ page }) => {
    test.setTimeout(10 * 60_000);
    await signIn(page, A.assistant);
    await warmGoto(page, "/ar/dashboard/assistant/attendance");
    // The on-behalf-of attribution is the ONLY thing distinguishing this shot
    // from the teacher's, so its absence is a failed capture, not a detail.
    await settle(page, { expect: /تعمل بالنيابة عن/ });

    // OPEN A REGISTER. The slot is "an assistant RECORDING attendance", and the
    // landing view is a list of lessons with buttons — a picture of a menu, not
    // of the work. Nothing is marked and nothing is saved here: opening the
    // register is a read, and the assistant's write path is already proven by
    // `assistant-door`.
    await page.locator("main tbody tr").first().getByRole("button").first().click();
    await settle(page, { expect: /توزيع الجلسة/ });

    // Wait for the STUDENT ROWS, not for the chart heading above them. The
    // heading renders first and the roster fetches behind its own spinner, so
    // matching "توزيع الجلسة" alone photographed a loading circle — the same
    // trap as the door roster.
    await expect
      .poll(async () => page.locator("main tbody tr").count(), { timeout: 45_000 })
      .toBeGreaterThan(3);
    await page.waitForTimeout(600);
    await expect(page.locator("main")).toContainText(/تعمل بالنيابة عن/);
    await shoot(page, "role-assistant");
  });
});

test.describe("capture · assistant phone", () => {
  test.use({ viewport: PHONE, colorScheme: "light", locale: "ar-EG", isMobile: true, hasTouch: true });

  test("assistant-door", async ({ page }) => {
    test.setTimeout(10 * 60_000);
    await signIn(page, A.assistant);
    await warmGoto(page, "/ar/dashboard/assistant/door");
    await settle(page, { expect: /حصص اليوم/ });

    // Open the lesson so the roster of counter-passed students is on screen —
    // an unopened list is a screenshot of a heading.
    const lesson = page.locator("main button").filter({ hasText: /—/ }).first();
    await lesson.click();
    await settle(page, { expect: /عند الباب/ });

    // WAIT FOR THE ROSTER, not just for the panel.
    //
    // The door roster fetches after the panel renders, behind its own spinner
    // that carries no `animate-pulse` class — so the generic settle() returned
    // happy and the first capture shipped a picture of a loading indicator
    // where the five counter-passed students should have been. One "تأكيد"
    // belongs to the code-entry field; the rest are per student, so more than
    // one means the roster has actually arrived.
    await expect
      .poll(async () => page.getByRole("button", { name: /تأكيد/ }).count(), { timeout: 45_000 })
      .toBeGreaterThan(1);
    await page.waitForTimeout(500);
    await shoot(page, "assistant-door");
  });
});
