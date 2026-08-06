import { test, expect, type Page } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { statePath } from "./auth-state";
import {
  LOCALES,
  MOBILE_ROLES,
  ROLES,
  SCREENS,
  type Locale,
  type Role,
} from "./screens";
import { VIEWPORTS } from "./playwright.config";

const OUT_ROOT = path.resolve(__dirname, "../../public/shots");

const manifest: {
  role: Role;
  locale: Locale;
  device: "desktop" | "mobile";
  key: string;
  path: string;
  file: string;
  note?: string;
}[] = [];

async function settle(page: Page) {
  await page.waitForLoadState("networkidle").catch(() => {
  });
  await page.evaluate(() => document.fonts.ready);
  await page
    .waitForFunction(
      () =>
        document.querySelectorAll('[data-slot="skeleton"], .animate-pulse')
          .length === 0,
      undefined,
      { timeout: 8_000 },
    )
    .catch(() => {});
  await page.waitForTimeout(350);
}

const DEVICES = [
  { name: "desktop" as const, viewport: VIEWPORTS.desktop, suffix: "" },
  { name: "mobile" as const, viewport: VIEWPORTS.mobile, suffix: ".mobile" },
];

for (const role of ROLES) {
  test.describe(`${role}`, () => {
    for (const device of DEVICES) {
      if (device.name === "mobile" && !MOBILE_ROLES.includes(role)) continue;

      for (const locale of LOCALES) {
        test.use({
          viewport: {
            width: device.viewport.width,
            height: device.viewport.height,
          },
          deviceScaleFactor: device.viewport.scale,
          isMobile: device.name === "mobile",
          hasTouch: device.name === "mobile",
        });

        test.use({ storageState: statePath(role) });

        test(`${role} · ${locale} · ${device.name}`, async ({ page }) => {
          const dir = path.join(OUT_ROOT, role);
          await mkdir(dir, { recursive: true });

          for (const screen of SCREENS[role]) {
            const url = `/${locale}${screen.path}`;
            const response = await page.goto(url, {
              waitUntil: "domcontentloaded",
            });

            expect(
              response?.status() ?? 0,
              `${url} returned ${response?.status()}`,
            ).toBeLessThan(400);

            expect(page.url(), `${url} bounced to login`).not.toMatch(
              /\/login/,
            );

            await settle(page);
            const broken = await page.evaluate(() => {
              const KEY = /^[a-z][A-Za-z0-9]*(\.[A-Za-z0-9]+)+$/;
              const rawKeys = [...document.querySelectorAll("h1,h2,h3,p,button,a,span,li")]
                .map((el) => (el.textContent ?? "").trim())
                .filter((t) => t.length > 0 && !t.includes("@") && KEY.test(t));

              return {
                rawKeys: [...new Set(rawKeys)].slice(0, 3),
                errorBoundary: /Something went wrong|حصل خطأ غير متوقع/.test(
                  document.body.innerText,
                ),
              };
            });
            expect(
              broken.errorBoundary,
              `${url} rendered the ERROR BOUNDARY — the screen crashed`,
            ).toBe(false);
            expect(
              broken.rawKeys,
              `${url} shows untranslated message keys: ${broken.rawKeys.join(", ")}`,
            ).toEqual([]);

            const file = `${screen.key}.${locale}${device.suffix}.png`;
            await page.screenshot({
              path: path.join(dir, file),
              fullPage: false,
              animations: "disabled",
              caret: "hide",
            });

            manifest.push({
              role,
              locale,
              device: device.name,
              key: screen.key,
              path: url,
              file: `shots/${role}/${file}`,
              note: screen.note,
            });
          }
        });
      }
    }
  });
}

test.afterAll(async () => {
  if (manifest.length === 0) return;
  await mkdir(OUT_ROOT, { recursive: true });
  await writeFile(
    path.join(OUT_ROOT, "manifest.json"),
    `${JSON.stringify(
      {
        source: "apps/showcase/tools/capture",
        viewports: VIEWPORTS,
        shots: manifest.sort(
          (a, b) =>
            a.role.localeCompare(b.role) ||
            a.device.localeCompare(b.device) ||
            a.key.localeCompare(b.key) ||
            a.locale.localeCompare(b.locale),
        ),
      },
      null,
      2,
    )}\n`,
  );
});
