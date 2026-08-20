/**
 * THE CLIPS — short silent recordings of the system being used.
 *
 * Four flows a still cannot make: the counter taking cash without the page
 * changing, the split arriving BEFORE a lesson is committed, the second
 * check-in at the hall door, and a walk-in student being minted at the desk.
 *
 * HOW THE RECORDING IS KEPT SHORT
 * Playwright records a whole browser context, so a naive run would ship a video
 * of a login form and a page load. Sign-in therefore happens in a THROWAWAY
 * context whose storage state is handed to the recorded one, and the recorded
 * context writes `clips.json` with the exact millisecond the action started and
 * ended. `render-clips.sh` trims to that window — no guessed offsets.
 *
 * EACH CLIP ENDS WHERE IT STARTED, on purpose. The brief wants the last frame
 * to sit next to the first without a jump, and the honest way to get that is to
 * design the loop into the flow rather than to crossfade over a seam.
 *
 * NO CURSOR IS DRAWN. Playwright does not render one, and a fake pointer is a
 * decoration rather than evidence — the state changes carry the story.
 *
 * WHAT THESE WRITE. Clips 1 and 4 write to the dev database: clip 1 takes 75
 * ج.م in cash through the real money engine (which is exactly what the counter
 * fixture was seeded to invite), and clip 4 creates a walk-in shell student.
 * Neither is reversible from the app, so `render-clips.sh` prints the cleanup
 * command. Clip 2 stops at the quote and never presses confirm — writing 423
 * ج.م to an append-only ledger for a video is not a trade worth making.
 *
 * Run:  PLAYWRIGHT_BROWSERS_PATH=0 npx playwright test \
 *         --config=tools/system-shots/playwright.config.ts -g "clip"
 *       tools/system-shots/render-clips.sh
 */
import { test, expect, type Page, type Browser } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.join(process.cwd(), "tools", "system-shots");
const VIDEO_DIR = path.join(ROOT, "video-raw");
const STATE_DIR = path.join(ROOT, ".auth");
const PASSWORD = "Passw0rd!";

const DESKTOP = { width: 1440, height: 900 };
const PHONE = { width: 390, height: 844 };

const A = {
  counterOwner: "counterdemo-hoda@edura.test",
  teacher: "showcasedemo-hossam@edura.test",
  assistant: "showcasedemo-nour@edura.test",
};

/**
 * The forbidden list is GENERATED FROM THE DATABASE by `build-forbidden.ts`,
 * not typed here. An earlier version of this file carried four hand-written
 * strings and therefore never checked for the second real person on this
 * database — a Gmail address and a live Egyptian mobile sitting on a student
 * account. A list a human maintains cannot know about a row added last week.
 */
const FORBIDDEN: string[] = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), "tools", "system-shots", "forbidden.json"), "utf8"),
).terms;

type Cut = {
  name: string;
  file: string;
  start: number;
  duration: number;
  width: number;
  height: number;
  /**
   * Seconds from the START of the cut to grab the poster from. Optional: the
   * default is one second before the end, which is right for a clip that
   * finishes on its outcome. It is WRONG for one that deliberately returns to
   * its opening view to loop — walk-in ends back at the top of an empty board,
   * so the default poster was a picture of nothing and that is what a
   * reduced-motion reader would have been shown.
   */
  posterAt?: number;
};
const cuts: Cut[] = [];

async function hideChrome(page: Page) {
  await page
    .addStyleTag({
      content:
        "nextjs-portal { display: none !important; } " +
        "[data-sonner-toaster], [data-sonner-toast] { opacity: 0 !important; }",
    })
    .catch(() => {});
}

async function warmGoto(page: Page, url: string) {
  for (let i = 0; i < 4; i++) {
    const res = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90_000 }).catch(() => null);
    if (res?.ok()) return;
    await page.waitForTimeout(2500);
  }
  throw new Error(`route never returned ok: ${url}`);
}

/** Signs in once in a context that is NOT being recorded, and keeps the state. */
async function authState(browser: Browser, email: string): Promise<string> {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  const file = path.join(STATE_DIR, `${email.replace(/[^a-z0-9]/gi, "_")}.json`);
  const ctx = await browser.newContext({ locale: "ar-EG" });
  const page = await ctx.newPage();
  await warmGoto(page, "/ar/login");
  await page.waitForLoadState("networkidle").catch(() => {});
  const emailBox = page.getByRole("textbox").first();
  const passBox = page.locator('input[type="password"]');
  await emailBox.waitFor({ state: "visible", timeout: 30_000 });
  // The form hydrates after paint and discards anything typed before it does.
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
  await ctx.storageState({ path: file });
  await ctx.close();
  return file;
}

/**
 * Records one clip. `open` positions the page and is NOT counted in the cut;
 * `act` is the part that ends up in the file.
 */
async function record(
  browser: Browser,
  opts: {
    name: string;
    email: string;
    viewport: { width: number; height: number };
    isMobile?: boolean;
    /** Seconds from the start of the cut; see `Cut.posterAt`. */
    posterAt?: number;
  },
  open: (page: Page) => Promise<void>,
  act: (page: Page) => Promise<void>,
) {
  const state = await authState(browser, opts.email);
  fs.mkdirSync(VIDEO_DIR, { recursive: true });

  const ctx = await browser.newContext({
    storageState: state,
    viewport: opts.viewport,
    colorScheme: "light",
    locale: "ar-EG",
    isMobile: opts.isMobile ?? false,
    hasTouch: opts.isMobile ?? false,
    // The counter board asks for the camera (card scanning). Granting nothing
    // keeps Chrome from painting a permission bubble over the recording.
    permissions: [],
    recordVideo: { dir: VIDEO_DIR, size: opts.viewport },
  });

  const contextStarted = Date.now();
  const page = await ctx.newPage();
  await open(page);
  await hideChrome(page);

  const actionStart = Date.now();
  await act(page);
  const actionEnd = Date.now();

  const body = (await page.locator("body").innerText()).toLowerCase();
  for (const needle of FORBIDDEN) {
    expect(body.includes(needle.toLowerCase()), `${opts.name}: "${needle}" is on screen`).toBe(false);
  }

  const video = page.video();
  await ctx.close(); // finalises the file
  const raw = await video!.path();

  cuts.push({
    name: opts.name,
    file: path.basename(raw),
    start: Math.max(0, (actionStart - contextStarted) / 1000 - 0.25),
    duration: (actionEnd - actionStart) / 1000 + 0.5,
    width: opts.viewport.width,
    height: opts.viewport.height,
    posterAt: opts.posterAt,
  });
  // eslint-disable-next-line no-console
  console.log(`clip ${opts.name}  ${((actionEnd - actionStart) / 1000).toFixed(1)}s`);
}

const beat = (page: Page, ms: number) => page.waitForTimeout(ms);

// NOT serial: a serial group SKIPS everything after a failure, and one bad
// clip took the other three down with it on the first run. The config already
// pins fullyParallel:false, so tests in this file still run one at a time in a
// single worker — which is what `cuts` being module-level relies on.
test.describe.configure({ mode: "default" });

/* ── 1 · THE COUNTER ─────────────────────────────────────────────────────── */

test("clip · counter-board", async ({ browser }) => {
  // Short on purpose: a stuck click should surface in minutes, not burn ten.
  test.setTimeout(4 * 60_000);
  await record(
    browser,
    { name: "counter-board", email: A.counterOwner, viewport: DESKTOP },
    async (page) => {
      await warmGoto(page, "/ar/dashboard/admin/counter");
      await expect(page.locator("main")).toContainText(/لم يسجّلوا/, { timeout: 45_000 });
      await page.getByRole("tab", { name: /لم يسجّلوا/ }).click();
      await expect
        .poll(async () => page.getByRole("button", { name: /تحصيل/ }).count(), { timeout: 45_000 })
        .toBeGreaterThan(0);
      await beat(page, 800);
    },
    async (page) => {
      // How many are already checked in. The assertion below wants this to go
      // UP by one — a hard-coded "1" would pass by accident on a fixture where
      // somebody had already been through the desk.
      const doneTab = await page.getByRole("tab", { name: /سجّلوا الحضور/ }).innerText();
      const checkedInBefore = Number(doneTab.match(/\d+/)?.[0] ?? 0);

      // Open on the queue: this is what a front desk looks like mid-shift.
      await beat(page, 1000);

      // FIND THE STUDENT BY A CODE READ OFF THE QUEUE, not by a hard-coded name.
      //
      // The first version typed "حبيبة". She is checked in after the first
      // successful take, so every later run searched a student with no collect
      // button left and sat on a click that could never resolve. Reading the
      // code off whichever row is still waiting makes the clip re-recordable on
      // any day, in any fixture state — and searching by code is what the
      // placeholder invites anyway ("اسم الطالب او الكود او الهاتف").
      // Walk up from the first cash button to whatever element also carries a
      // student code, rather than guessing the row's tag — a `li`/`card`
      // selector was tried and matched nothing, because the row is neither.
      const code = await page.evaluate(() => {
        const btn = [...document.querySelectorAll("main button")].find((b) =>
          /تحصيل/.test(b.textContent ?? ""),
        );
        for (let el = btn?.parentElement; el; el = el.parentElement) {
          const m = (el.textContent ?? "").match(/\b[A-Z0-9]{6,10}\b/);
          if (m) return m[0];
        }
        return null;
      });
      expect(code, "no student code found on the waiting queue").toBeTruthy();

      const search = page.getByRole("searchbox").first();
      await search.click();
      await search.pressSequentially(code!, { delay: 60 });
      await beat(page, 700);
      await expect(
        page.getByRole("button", { name: /تحصيل/ }),
        "the searched student has no cash action left — pick another",
      ).toHaveCount(1, { timeout: 15_000 });

      // Take the cash and check them in — ONE action, which is the whole point.
      const collect = page.getByRole("button", { name: /تحصيل/ }).first();
      await collect.click();
      await beat(page, 600);

      // THE COMMIT IS TWO PRESSES, and the screen says so: "الضغطة الأولى
      // تُسلّح الزر، والثانية تنفّذ". It is an inline panel, not a dialog — the
      // first version of this clip looked for `getByRole("dialog")`, found
      // nothing, and ended with the cash panel open, no money taken and both
      // tabs still reading 0/8. A clip of a button not being pressed.
      // The two presses are two DIFFERENT buttons as far as a locator is
      // concerned: arming relabels it from "تحصيل 75 ج.م نقدًا" to
      // "تأكيد — استلمت 75 ج.م", so re-clicking the original name waits on a
      // control that no longer exists — which is precisely how the second take
      // of this clip spent ten minutes on one click. The relabel is worth
      // seeing anyway: the screen asks the clerk to confirm the cash is in hand.
      await page.getByRole("button", { name: /تحصيل .* نقدًا/ }).last().click();
      await beat(page, 700);
      await page.getByRole("button", { name: /تأكيد/ }).last().click();

      // WAIT FOR THE COUNTER TO MOVE before touching anything else.
      //
      // Taking cash and checking in are two server calls on purpose (see
      // `use-checkin-commit.ts`: one atomic call would mark a student present
      // even under counter_and_door, breaking the door stage). The second call
      // was still in flight when an earlier take cleared the search box, the
      // row re-rendered underneath it, and the take shipped a payment with no
      // attendance — the "paid but not checked in" case the product warns about
      // in a toast this recording deliberately hides.
      //
      // Asserting the tab count is also the only honest proof the clip shows
      // what it claims: if the check-in did not land, this fails instead of
      // quietly recording a half-finished shift.
      await expect(page.getByRole("tab", { name: /سجّلوا الحضور/ })).toContainText(
        String(checkedInBefore + 1),
        { timeout: 30_000 },
      );
      await beat(page, 900);

      // Clear the search and land back on the queue — one row shorter, which is
      // what makes the loop read as a shift progressing rather than a reset.
      await search.fill("");
      await beat(page, 1000);
    },
  );
});

/* ── 2 · CLOSING A LESSON ────────────────────────────────────────────────── */

test("clip · settlement", async ({ browser }) => {
  test.setTimeout(12 * 60_000);
  await record(
    browser,
    { name: "settlement", email: A.teacher, viewport: DESKTOP },
    async (page) => {
      await warmGoto(page, "/ar/dashboard/teacher/attendance");
      await expect(page.locator("main")).toContainText(/تسجيل الحضور/, { timeout: 45_000 });
      // TODAY'S lesson — the first row — and the button BY NAME.
      //
      // The oldest lesson was tried first and is a dead end: its register opens
      // with no enabled status controls at all and the save button permanently
      // disabled, so the recording sat on a click that could never resolve
      // until the test timed out. Today's lesson is also the one the live seed
      // resets to `counter_only` on every run, which is what makes marking the
      // room present a REAL change rather than a no-op the save button ignores.
      await page
        .locator("main tbody tr")
        .first()
        .getByRole("button", { name: "تسجيل الحضور" })
        .click();
      await expect
        .poll(async () => page.locator("main tbody tr").count(), { timeout: 45_000 })
        .toBeGreaterThan(3);
      await beat(page, 800);
    },
    async (page) => {
      await beat(page, 1500);

      // Mark the room present, one student at a time.
      const rows = page.locator("main tbody tr");
      const n = Math.min(await rows.count(), 5);
      for (let i = 0; i < n; i++) {
        const btn = rows.nth(i).getByRole("button", { name: "حاضر", exact: true });
        if (await btn.count()) await btn.first().click();
        await beat(page, 420);
      }
      await beat(page, 600);

      // Save only enables when something actually changed. Asserting it beats
      // clicking into a disabled control and waiting out the timeout.
      const save = page.getByRole("button", { name: "حفظ الحضور" });
      await expect(save).toBeEnabled({ timeout: 15_000 });
      await save.click();
      await beat(page, 1800);

      // The quote arrives — BEFORE anything is committed.
      const card = page
        .locator('[data-slot="card"]')
        .filter({ hasText: "إقفال الحصة وتوزيع حصيلتها" })
        .last();
      await card.scrollIntoViewIfNeeded();
      await hideChrome(page);
      await beat(page, 3000);

      // Back to the register. The confirm button is deliberately never pressed.
      await page.evaluate(() => window.scrollTo(0, 0));
      await beat(page, 1600);
    },
  );
});

/* ── 3 · THE DOOR, ON A PHONE ────────────────────────────────────────────── */

test("clip · assistant-door", async ({ browser }) => {
  test.setTimeout(10 * 60_000);
  await record(
    browser,
    { name: "assistant-door", email: A.assistant, viewport: PHONE, isMobile: true },
    async (page) => {
      await warmGoto(page, "/ar/dashboard/assistant/door");
      await expect(page.locator("main")).toContainText(/حصص اليوم/, { timeout: 45_000 });
      await page.locator("main button").filter({ hasText: /—/ }).first().click();
      await expect
        .poll(async () => page.getByRole("button", { name: /تأكيد/ }).count(), { timeout: 45_000 })
        .toBeGreaterThan(1);
      await beat(page, 800);
    },
    async (page) => {
      await beat(page, 1600);
      // Two students confirmed at the hall door, with a pause between them —
      // the rhythm of a queue rather than a script.
      for (let i = 0; i < 2; i++) {
        const confirm = page.getByRole("button", { name: /تأكيد/ }).nth(1);
        if (await confirm.count()) {
          await confirm.click();
          await beat(page, 2600);
        }
      }
      await beat(page, 1800);
    },
  );
});

/* ── 4 · WALK-IN REGISTRATION ────────────────────────────────────────────── */

test("clip · walk-in", async ({ browser }) => {
  test.setTimeout(10 * 60_000);
  // THE LINK IN THIS CLIP SHOWS WHATEVER `APP_BASE_URL` SAYS.
  //
  // In dev that is the LAN address in `.env`, which is right for testing on a
  // phone and wrong for a marketing image. To record a take carrying the live
  // host, override it for the recording only, then remove the override:
  //
  //   echo 'APP_BASE_URL=https://edura-erp.vercel.app' > apps/erp/.env.local
  //   # restart the dev server, run this clip, then:
  //   rm apps/erp/.env.local   # and restart again
  //
  // THE HOST IS THE ERP'S OWN. A claim link lands a student in this app, not on
  // the marketing site — `edura-www.vercel.app` would be the wrong building.
  // The custom domain is deliberately NOT used here: it is not what the product
  // runs on today, and a clip that shows an address nobody can reach is a clip
  // that ages badly.
  //
  // Leaving the file in place would point every dev claim link away from the
  // LAN address, so it is a per-recording override, not a setting.
  //
  // A distinct phone per run: the endpoint refuses a duplicate by phone and
  // sends a code reminder instead, which is correct behaviour and a useless
  // recording. Derived from the clock, which is fine here because nothing about
  // the clip depends on the value being stable.
  const suffix = String(Date.now()).slice(-4);
  await record(
    browser,
    // The poster is pulled from the OUTCOME — code minted, link on screen —
    // not from the loop-friendly ending back at the top of the board.
    { name: "walk-in", email: A.counterOwner, viewport: DESKTOP, posterAt: 8.4 },
    async (page) => {
      await warmGoto(page, "/ar/dashboard/admin/counter");
      await expect(page.locator("main")).toContainText(/طالب جديد/, { timeout: 45_000 });
      await beat(page, 800);
    },
    async (page) => {
      await beat(page, 1000);

      await page.getByRole("button", { name: "طالب جديد (مؤقت)" }).click();
      await beat(page, 900);

      await page.getByPlaceholder("الاسم الكامل").pressSequentially("سلمى عبد الرحمن", { delay: 55 });
      await beat(page, 400);
      await page.getByPlaceholder(/الهاتف \(01/).pressSequentially(`0100000${suffix}`, { delay: 50 });
      await beat(page, 500);

      await page.getByRole("button", { name: "إنشاء طالب مؤقت" }).click();
      await beat(page, 1600);

      // The form collapses ITSELF on success and the outcome panel takes its
      // place — the student code, and the notice telling the counter to hand
      // the claim link over in person because this minor has no guardian email
      // on file yet. Pressing the toggle again here (the first version did)
      // re-opens an empty form and throws that away, which is why the clip
      // ended on a blank form instead of on the thing it exists to show.
      await page.evaluate(() => window.scrollBy({ top: 420, behavior: "smooth" }));
      await beat(page, 2400);

      // Back to the top of the board, and clear the code the counter dropped
      // into the search box, so the last frame matches the first.
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: "smooth" }));
      const box = page.getByRole("searchbox").first();
      if (await box.count()) await box.fill("");
      await beat(page, 1300);
    },
  );
});

test.afterAll(async () => {
  fs.mkdirSync(ROOT, { recursive: true });
  const file = path.join(ROOT, "clips.json");

  // MERGE, don't overwrite. Re-recording one clip must not erase the cut points
  // of the other three — which is exactly what happened the first time, when a
  // three-clip run wiped the counter-board entry and `render-clips.sh` then had
  // nothing to trim it from.
  const prior: Cut[] = fs.existsSync(file) ? (JSON.parse(fs.readFileSync(file, "utf8")).cuts ?? []) : [];
  const merged = new Map(prior.map((c) => [c.name, c]));
  for (const c of cuts) merged.set(c.name, c);
  fs.writeFileSync(file, JSON.stringify({ cuts: [...merged.values()] }, null, 2));
  // eslint-disable-next-line no-console
  console.log(`\nwrote ${cuts.length} cuts to tools/system-shots/clips.json`);
});
