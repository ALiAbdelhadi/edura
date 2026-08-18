/**
 * ROUTE + TAB PROBE — the inventory pass. Captures NOTHING.
 *
 * A file listing of `src/app/**\/page.tsx` gives the routes and stops there.
 * The tabs inside a route are in-page state, not routes, so the only way to
 * learn them is to load the page as a signed-in role and read the DOM. That is
 * all this does: it walks every route for every portal, records the tab strip,
 * counts what is on screen, and writes one JSON file that INVENTORY.md is
 * generated from.
 *
 * Run:  bun run --cwd apps/erp probe:system
 * (dev server already running on :3002)
 *
 * Deliberately NOT a test suite — it asserts almost nothing, because a route
 * that renders an empty state is a finding to record, not a failure.
 */
import { test, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const OUT = path.join(process.cwd(), "tools", "system-shots");
const PASSWORD = "Passw0rd!";
const LOCALE = "ar";

/** One signed-in role, and the routes that role owns. */
type Portal = { key: string; email: string; label: string; routes: string[] };

const PORTALS: Portal[] = [
  {
    key: "admin",
    label: "Center portal (role center_admin) — NOT the superadmin app",
    email: "admin@nile-academy.eg",
    routes: [
      "/dashboard/admin",
      "/dashboard/admin/counter",
      "/dashboard/admin/checkin",
      "/dashboard/admin/students",
      "/dashboard/admin/teachers",
      "/dashboard/admin/classes",
      "/dashboard/admin/enrollment-requests",
      "/dashboard/admin/schedule",
      "/dashboard/admin/rooms",
      "/dashboard/admin/external-teachers",
      "/dashboard/admin/external-teachers/gaps",
      "/dashboard/admin/fees",
      "/dashboard/admin/expenses",
      "/dashboard/admin/reports",
      "/dashboard/admin/staff",
      "/dashboard/admin/notes",
      "/dashboard/admin/audit",
      "/dashboard/admin/messages",
      "/dashboard/admin/notifications",
      "/dashboard/admin/settings",
    ],
  },
  {
    key: "admin-showcase",
    label: "Center portal, showcase-demo center (richer fixture)",
    email: "showcasedemo-marwan@edura.test",
    routes: [
      "/dashboard/admin",
      "/dashboard/admin/counter",
      "/dashboard/admin/students",
      "/dashboard/admin/reports",
      "/dashboard/admin/schedule",
      "/dashboard/admin/staff",
      "/dashboard/admin/rooms",
      "/dashboard/admin/fees",
    ],
  },
  {
    key: "teacher",
    label: "Teacher portal",
    email: "hossam.aziz@nile-academy.eg",
    routes: [
      "/dashboard/teacher",
      "/dashboard/teacher/attendance",
      "/dashboard/teacher/door",
      "/dashboard/teacher/classes",
      "/dashboard/teacher/centers",
      "/dashboard/teacher/grades",
      "/dashboard/teacher/materials",
      "/dashboard/teacher/reviews",
      "/dashboard/teacher/team",
      "/dashboard/teacher/notes",
      "/dashboard/teacher/wallet",
      "/dashboard/teacher/messages",
      "/dashboard/teacher/notifications",
      "/dashboard/teacher/settings",
    ],
  },
  {
    key: "parent",
    label: "Parent portal",
    email: "mona.hassan@email.eg",
    routes: [
      "/dashboard/parent",
      "/dashboard/parent/children",
      "/dashboard/parent/attendance",
      "/dashboard/parent/progress",
      "/dashboard/parent/pay",
      "/dashboard/parent/fees",
      "/dashboard/parent/wallet",
      "/dashboard/parent/oversight",
      "/dashboard/parent/messages",
      "/dashboard/parent/notifications",
      "/dashboard/parent/settings",
    ],
  },
  {
    key: "student",
    label: "Student portal",
    email: "lina.hassan@student.nile-academy.eg",
    routes: [
      "/dashboard/student",
      "/dashboard/student/subjects",
      "/dashboard/student/courses",
      "/dashboard/student/schedule",
      "/dashboard/student/attendance",
      "/dashboard/student/grades",
      "/dashboard/student/materials",
      "/dashboard/student/practice",
      "/dashboard/student/reviews",
      "/dashboard/student/id",
      "/dashboard/student/wallet",
      "/dashboard/student/family",
      "/dashboard/student/messages",
      "/dashboard/student/notifications",
      "/dashboard/student/settings",
    ],
  },
  {
    key: "assistant",
    /**
     * `showcasedemo-nour` and NOT `sara.fawzy@nile-academy.eg`.
     *
     * An assistant serves exactly one teacher, and `/dashboard/assistant/door`
     * only exists when that teacher's attendance mode is `counter_and_door`.
     * Sara's teacher (hossam.aziz) is `counter_only`, so the door screen 403s
     * for her — correctly. Nour assists showcasedemo-hossam, who is
     * `counter_and_door`, so the door screen is reachable at all.
     */
    label: "Assistant portal (acts on behalf of a counter_and_door teacher)",
    email: "showcasedemo-nour@edura.test",
    routes: [
      "/dashboard/assistant",
      "/dashboard/assistant/attendance",
      "/dashboard/assistant/door",
      "/dashboard/assistant/classes",
      "/dashboard/assistant/collaborations",
      "/dashboard/assistant/grades",
      "/dashboard/assistant/materials",
      "/dashboard/assistant/notes",
      "/dashboard/assistant/messages",
      "/dashboard/assistant/notifications",
      "/dashboard/assistant/settings",
    ],
  },
  {
    key: "staff",
    /**
     * The MANAGER sub-role, because the sweep needs to reach every screen.
     * `showcasedemo-laila` is a receptionist and her portal 403s on rooms,
     * collaborations, finance and reports — that is the default-closed
     * permission tier working, not a fixture problem.
     */
    label: "Center staff portal — manager sub-role",
    email: "showcasedemo-tarek@edura.test",
    routes: [
      "/dashboard/staff",
      "/dashboard/staff/checkin",
      "/dashboard/staff/students",
      "/dashboard/staff/rooms",
      "/dashboard/staff/collaborations",
      "/dashboard/staff/finance",
      "/dashboard/staff/reports",
      "/dashboard/staff/notes",
      "/dashboard/staff/messages",
      "/dashboard/staff/notifications",
      "/dashboard/staff/settings",
    ],
  },
  {
    key: "staff-reception",
    /** The same portal one tier down — this row IS the permission boundary. */
    label: "Center staff portal — receptionist sub-role (shows what is denied)",
    email: "showcasedemo-laila@edura.test",
    routes: [
      "/dashboard/staff",
      "/dashboard/staff/checkin",
      "/dashboard/staff/students",
      "/dashboard/staff/rooms",
      "/dashboard/staff/finance",
      "/dashboard/staff/reports",
    ],
  },
];

/**
 * The dynamic segments, resolved to REAL demo ids.
 *
 * Every id below was discovered by the list-page pass (`detailHref`) rather
 * than guessed, so each one is a row that genuinely exists in the demo data.
 */
const DETAIL: { key: string; email: string | null; routes: string[] }[] = [
  {
    key: "detail-admin",
    email: "admin@nile-academy.eg",
    routes: ["/dashboard/admin/students/d745907b-4d9b-416a-91d1-beb787e2799b"],
  },
  {
    key: "detail-admin-showcase",
    email: "showcasedemo-marwan@edura.test",
    routes: ["/dashboard/admin/students/08b929d8-c147-569d-a426-7640dcb0c611"],
  },
  {
    key: "detail-extteachers",
    email: "extdemo-mona@edura.test",
    routes: ["/dashboard/admin/external-teachers", "/dashboard/admin/external-teachers/gaps"],
  },
  {
    key: "detail-parent",
    email: "mona.hassan@email.eg",
    routes: ["/dashboard/parent/children/d745907b-4d9b-416a-91d1-beb787e2799b/id"],
  },
  {
    key: "detail-public",
    email: null,
    routes: [
      "/courses/c0730f77-e329-4baa-a99d-a5f2cfc1b7ce",
      "/centers/25a63de4-3c41-5fc9-a56a-ccf858e493ab",
      "/help/create-center-account",
    ],
  },
];

/** Routes reachable with no session at all. */
const PUBLIC_ROUTES = [
  "/",
  "/login",
  "/register",
  "/onboarding",
  "/pricing",
  "/faq",
  "/help",
  "/contact",
  "/changelog",
  "/privacy",
  "/terms",
  "/forgot-password",
  "/reset-password",
  "/two-factor",
  "/claim",
  "/invite/accept",
  "/guardian/verify",
  "/ui-preview",
  "/receipt-preview",
];

/**
 * The dev-tools badge is a fixed overlay that INTERCEPTS CLICKS in the
 * bottom-left corner. Every spec in help-shots hides it; so does this one.
 */
async function hideDevBadge(page: Page) {
  await page
    .addStyleTag({ content: "nextjs-portal { display: none !important; }" })
    .catch(() => {});
}

/**
 * A cold `next dev` compiles on first request, and a half-compiled chunk
 * throws a ReferenceError in the browser for a symbol the source exports
 * fine. Both look exactly like source defects. So: retry until the navigation
 * really returns ok, and record the failure rather than swallowing it.
 */
async function warmGoto(page: Page, url: string, tries = 3) {
  let last = "";
  for (let i = 0; i < tries; i++) {
    try {
      const res = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90_000 });
      if (res?.ok()) return { ok: true, status: res.status(), note: "" };
      last = `status ${res?.status() ?? "none"}`;
    } catch (e) {
      last = (e as Error).message.split("\n")[0]!;
    }
    await page.waitForTimeout(2500);
  }
  return { ok: false, status: 0, note: last };
}

/**
 * Signs in, and CHECKS THE FIELDS KEPT THEIR VALUE.
 *
 * The login form is a client component: filling it before React hydrates sets
 * the DOM value, then hydration replaces the input with its own state and the
 * value is gone. The form then reports "البريد الإلكتروني مطلوب" over two
 * fields that visibly had text in them a moment earlier — which is what
 * happened on the first run of this probe. Reading the value back and
 * refilling is the fix; waiting a guessed number of milliseconds is not.
 */
async function signIn(page: Page, email: string) {
  await warmGoto(page, `/${LOCALE}/login`);
  await page.waitForLoadState("networkidle").catch(() => {});

  const emailBox = page.getByRole("textbox").first();
  const passBox = page.locator('input[type="password"]');
  await emailBox.waitFor({ state: "visible", timeout: 30_000 });

  for (let i = 0; i < 4; i++) {
    await emailBox.fill(email);
    await passBox.fill(PASSWORD);
    await page.waitForTimeout(400);
    if ((await emailBox.inputValue()) === email && (await passBox.inputValue()) === PASSWORD) break;
  }

  await page.getByRole("button", { name: /sign in|تسجيل الدخول/i }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 45_000 });
  // A per-user first-run gate opens once, ever. Clearing it here means the
  // probe sees the steady-state screen rather than a tour card over it.
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

type Probe = {
  portal: string;
  route: string;
  url: string;
  ok: boolean;
  status: number;
  note: string;
  title: string;
  heading: string;
  tabs: { label: string; selected: boolean; changesUrl: boolean }[];
  tabMechanism: string;
  rows: number;
  cards: number;
  emptyState: boolean;
  detailHref: string | null;
  consoleErrors: string[];
  /**
   * The login rate limiter (security finding C2) also throttles the API under
   * a fast sweep. A throttled screen renders its EMPTY state, which is
   * indistinguishable from a screen with no data — so it is recorded, not
   * quietly reported as "nothing to shoot here".
   */
  throttled: boolean;
};

/** Reads the tab strip and the amount of content, from the DOM the app built. */
async function inspect(page: Page) {
  return page.evaluate(() => {
    const txt = (el: Element | null) => (el?.textContent ?? "").replace(/\s+/g, " ").trim();

    // Tabs, in priority order: real ARIA tabs, then Radix's slot, then a
    // segmented control built out of grouped buttons.
    let mechanism = "none";
    let nodes: Element[] = Array.from(document.querySelectorAll('[role="tab"]'));
    if (nodes.length) mechanism = 'role="tab"';
    if (!nodes.length) {
      nodes = Array.from(document.querySelectorAll('[data-slot="tabs-trigger"]'));
      if (nodes.length) mechanism = 'data-slot="tabs-trigger"';
    }
    if (!nodes.length) {
      // A segmented control built from grouped buttons. Two guards, because
      // the first pass of this probe reported a search field and an empty
      // wrapper as "tabs": a real control has MORE THAN ONE choice and every
      // choice is labelled.
      for (const group of Array.from(
        document.querySelectorAll('[role="group"], [data-segmented], .segmented'),
      )) {
        const btns = Array.from(group.querySelectorAll("button"));
        if (btns.length > 1 && btns.every((b) => txt(b).length > 0)) {
          nodes = btns;
          mechanism = "segmented buttons";
          break;
        }
      }
    }
    if (!nodes.length) {
      // View switchers that are LINKS carrying a query param on the same
      // pathname — a tab strip that changes the URL, which matters because it
      // can be shot by navigation instead of by clicking.
      const here = location.pathname;
      const links = Array.from(document.querySelectorAll("main a[href]")).filter((a) => {
        const href = (a as HTMLAnchorElement).getAttribute("href") ?? "";
        return href.includes("?") && href.split("?")[0] === here && txt(a).length > 0;
      });
      if (links.length > 1) {
        nodes = links;
        mechanism = "query-param links";
      }
    }

    const tabs = nodes
      .map((n) => ({
        label: txt(n),
        selected:
          n.getAttribute("aria-selected") === "true" || n.getAttribute("data-state") === "active",
        // A tab that is really a link changes the URL; a button does not.
        changesUrl: n.tagName === "A" || !!n.closest("a"),
      }))
      .filter((t) => t.label.length > 0);

    const main = document.querySelector("main") ?? document.body;
    const rows = main.querySelectorAll("table tbody tr, [role='row']").length;
    const cards = main.querySelectorAll(
      "[data-slot='card'], article, li[class*='row'], [data-row]",
    ).length;
    const body = txt(main);
    const emptyState =
      /لا يوجد|لا توجد|مفيش|ابدأ بإضافة|no results|nothing here|empty/i.test(body) && rows < 2;

    // The first link into a detail route, so dynamic segments get a REAL id
    // from the demo data rather than a guessed one.
    const detail = Array.from(main.querySelectorAll("a[href]"))
      .map((a) => (a as HTMLAnchorElement).getAttribute("href") ?? "")
      .find((h) => /\/(students|teachers|external-teachers|children|receipts|courses|centers|help)\/[^/?#]+/.test(h) && !h.endsWith("/gaps"));

    return {
      title: document.title,
      heading: txt(document.querySelector("h1")),
      tabs,
      tabMechanism: mechanism,
      rows,
      cards,
      emptyState,
      detailHref: detail ?? null,
    };
  });
}

const results: Probe[] = [];

async function walk(page: Page, portal: string, routes: string[]) {
  for (const route of routes) {
    const errors: string[] = [];
    const onErr = (m: { type(): string; text(): string }) => {
      if (m.type() === "error") errors.push(m.text().slice(0, 200));
    };
    page.on("console", onErr);

    const url = `/${LOCALE}${route === "/" ? "" : route}`;
    const nav = await warmGoto(page, url);
    await hideDevBadge(page);
    // Fonts load with font-display: swap, so the display face lands after
    // first paint and every heading changes height. Measure after it settles.
    await page.evaluate(() => document.fonts.ready).catch(() => {});
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.waitForTimeout(500);

    let info: Awaited<ReturnType<typeof inspect>> | null = null;
    try {
      info = await inspect(page);
    } catch {
      /* a route that failed to render has nothing to inspect */
    }

    page.off("console", onErr);
    const throttled = errors.some((e) => e.includes("429"));
    results.push({
      throttled,
      portal,
      route,
      url,
      ok: nav.ok,
      status: nav.status,
      note: nav.note,
      title: info?.title ?? "",
      heading: info?.heading ?? "",
      tabs: info?.tabs ?? [],
      tabMechanism: info?.tabMechanism ?? "none",
      rows: info?.rows ?? 0,
      cards: info?.cards ?? 0,
      emptyState: info?.emptyState ?? false,
      detailHref: info?.detailHref ?? null,
      consoleErrors: errors,
    });

    // eslint-disable-next-line no-console
    console.log(
      `${nav.ok ? "ok " : "FAIL"} ${portal}${route}  tabs=${info?.tabs.length ?? 0} rows=${info?.rows ?? 0}${info?.emptyState ? " EMPTY" : ""}${throttled ? " THROTTLED-429" : ""}${errors.some((e) => e.includes("403")) ? " 403" : ""}`,
    );

    // Pace the sweep under the rate limiter. Without this the parent portal
    // 429s from its fifth route onward and every screen after it reports empty.
    await page.waitForTimeout(throttled ? 20_000 : 1_500);
  }
}

test.describe.configure({ mode: "serial" });

test("public routes", async ({ page }) => {
  test.setTimeout(20 * 60_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await walk(page, "public", PUBLIC_ROUTES);
});

for (const portal of PORTALS) {
  test(`${portal.key} routes`, async ({ page }) => {
    test.setTimeout(30 * 60_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await signIn(page, portal.email);
    await walk(page, portal.key, portal.routes);
  });
}

for (const d of DETAIL) {
  test(`${d.key} routes`, async ({ page }) => {
    test.setTimeout(15 * 60_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    if (d.email) await signIn(page, d.email);
    await walk(page, d.key, d.routes);
  });
}

test.afterAll(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const file = path.join(OUT, "probe.json");

  // MERGE, don't overwrite. Running `-g "admin routes"` on its own must not
  // discard the other six portals' rows — otherwise re-probing one portal
  // silently empties the inventory the report is generated from.
  const prior: Probe[] = fs.existsSync(file)
    ? (JSON.parse(fs.readFileSync(file, "utf8")).results ?? [])
    : [];
  const merged = new Map(prior.map((r) => [`${r.portal}${r.route}`, r]));
  for (const r of results) merged.set(`${r.portal}${r.route}`, r);

  fs.writeFileSync(
    file,
    JSON.stringify(
      {
        generatedFor: "inventory",
        locale: LOCALE,
        portals: PORTALS.map((p) => ({ key: p.key, email: p.email, label: p.label })),
        results: [...merged.values()],
      },
      null,
      2,
    ),
  );
  // eslint-disable-next-line no-console
  console.log(`\nwrote ${results.length} rows to tools/system-shots/probe.json`);
});
