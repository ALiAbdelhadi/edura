import { chromium, type Page } from "playwright";

const BASE = process.env.CAPTURE_BASE_URL ?? "http://localhost:3010";
const OUT = new URL("../shots/", import.meta.url).pathname;

type ShotBase = {
  name: string;
  locale: "ar" | "en";
  theme: "light" | "dark";
  width: number;
  height: number;
};

type Shot = ShotBase & { path?: string };

const SHOTS: Shot[] = [
  { name: "ar-light-desktop", locale: "ar", theme: "light", width: 1440, height: 900 },
  { name: "ar-dark-desktop", locale: "ar", theme: "dark", width: 1440, height: 900 },
  { name: "en-light-desktop", locale: "en", theme: "light", width: 1440, height: 900 },
  { name: "en-dark-desktop", locale: "en", theme: "dark", width: 1440, height: 900 },
  { name: "ar-light-phone", locale: "ar", theme: "light", width: 390, height: 844 },
  { name: "en-dark-phone", locale: "en", theme: "dark", width: 390, height: 844 },

  { name: "ar-for-center", locale: "ar", theme: "light", width: 1440, height: 900, path: "/for/center" },
  { name: "ar-for-teacher", locale: "ar", theme: "dark", width: 1440, height: 900, path: "/for/teacher" },
  { name: "en-for-parent", locale: "en", theme: "light", width: 1440, height: 900, path: "/for/parent" },
  { name: "ar-for-student-phone", locale: "ar", theme: "light", width: 390, height: 844, path: "/for/student" },
  { name: "ar-for-assistant", locale: "ar", theme: "light", width: 1440, height: 900, path: "/for/assistant" },

  { name: "ar-pricing", locale: "ar", theme: "light", width: 1440, height: 900, path: "/pricing" },
  { name: "en-pricing", locale: "en", theme: "dark", width: 1440, height: 900, path: "/pricing" },
  { name: "ar-faq", locale: "ar", theme: "light", width: 1440, height: 900, path: "/faq" },
  { name: "ar-trust", locale: "ar", theme: "dark", width: 1440, height: 900, path: "/trust" },
  { name: "ar-privacy", locale: "ar", theme: "light", width: 1440, height: 900, path: "/privacy" },
  { name: "ar-terms-phone", locale: "ar", theme: "light", width: 390, height: 844, path: "/terms" },
  { name: "ar-contact", locale: "ar", theme: "light", width: 1440, height: 900, path: "/contact" },
  { name: "en-contact-phone", locale: "en", theme: "dark", width: 390, height: 844, path: "/contact" },
];

async function settle(page: Page) {
  await page.waitForLoadState("networkidle");
  await page
    .waitForFunction(() => document.documentElement.dataset.motionSettled !== undefined, null, {
      timeout: 5000,
    })
    .catch(() => {});

  await page.evaluate(async () => {
    document.documentElement.style.scrollBehavior = "auto";
    const step = window.innerHeight * 0.75;
    for (let y = 0; y < document.body.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise((resolve) => setTimeout(resolve, 90));
    }
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(900);
}

async function figuresAreTrue(page: Page) {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>("[data-count]")]
      .filter((el) => el.textContent !== el.dataset.count)
      .map((el) => `${el.dataset.count} rendered as ${el.textContent}`),
  );
}

const browser = await chromium.launch();
const failures: string[] = [];

{
  const warm = await browser.newContext();
  const page = await warm.newPage();
  for (const path of new Set(SHOTS.map((s) => `${s.locale}${s.path ?? ""}`))) {
    for (let attempt = 0; attempt < 6; attempt++) {
      const response = await page
        .goto(`${BASE}/${path}`, { waitUntil: "domcontentloaded" })
        .catch(() => null);
      if (response?.ok()) break;
      await page.waitForTimeout(600);
    }
  }
  await warm.close();
}

for (const shot of SHOTS) {
  const context = await browser.newContext({
    viewport: { width: shot.width, height: shot.height },
    deviceScaleFactor: 2,
    colorScheme: shot.theme,
    locale: shot.locale === "ar" ? "ar-EG" : "en-US",
  });
  const page = await context.newPage();

  const consoleErrors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") consoleErrors.push(m.text());
  });
  page.on("pageerror", (e) => consoleErrors.push(String(e)));

  await page.goto(`${BASE}/${shot.locale}${shot.path ?? ""}`, { waitUntil: "domcontentloaded" });
  await settle(page);

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  if (overflow > 0) failures.push(`${shot.name}: horizontal overflow of ${overflow}px`);
  if (consoleErrors.length) failures.push(`${shot.name}: console errors — ${consoleErrors[0]}`);

  const wrongFigures = await figuresAreTrue(page);
  if (wrongFigures.length) failures.push(`${shot.name}: mid-count figure — ${wrongFigures[0]}`);

  await page.screenshot({ path: `${OUT}${shot.name}.png`, fullPage: true });
  console.log(`captured ${shot.name}`);

  await context.close();
}

await browser.close();

if (failures.length) {
  console.error("\nFAILURES:");
  for (const f of failures) console.error("  " + f);
  process.exit(1);
}
console.log("\nall captures clean");
