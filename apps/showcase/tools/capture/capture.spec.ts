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

/** Written alongside the PNGs so a reviewer can see what produced them. */
const manifest: {
  role: Role;
  locale: Locale;
  device: "desktop" | "mobile";
  key: string;
  path: string;
  file: string;
  note?: string;
}[] = [];

/**
 * Screenshots race two things that are invisible in a passing run and obvious
 * in a bad asset: a skeleton that has not resolved, and a font that has not
 * swapped. Both are waited on explicitly rather than with a sleep.
 */
async function settle(page: Page) {
  await page.waitForLoadState("networkidle").catch(() => {
    // networkidle never fires on pages holding a socket open (messaging, and
    // any screen rendering the chat panel). Falling through is correct — the
    // data wait below is the real signal.
  });
  await page.evaluate(() => document.fonts.ready);
  // Any remaining skeletons/spinners should be gone. Best-effort: a screen with
  // no skeleton markup resolves immediately.
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
      // Only the phone-first portals get a mobile pass — see MOBILE_ROLES.
      if (device.name === "mobile" && !MOBILE_ROLES.includes(role)) continue;

      for (const locale of LOCALES) {
        test.use({
          viewport: {
            width: device.viewport.width,
            height: device.viewport.height,
          },
          deviceScaleFactor: device.viewport.scale,
          // Touch + mobile UA so the app takes its phone branch (bottom nav)
          // rather than rendering the desktop layout at a narrow width.
          isMobile: device.name === "mobile",
          hasTouch: device.name === "mobile",
        });

        // The saved session for this role, minted once by the setup project.
        test.use({ storageState: statePath(role) });

        test(`${role} · ${locale} · ${device.name}`, async ({ page }) => {
          const dir = path.join(OUT_ROOT, role);
          await mkdir(dir, { recursive: true });

          for (const screen of SCREENS[role]) {
            const url = `/${locale}${screen.path}`;
            const response = await page.goto(url, {
              waitUntil: "domcontentloaded",
            });

            // A 4xx/5xx here means the manifest names a route that no longer
            // exists — fail loudly rather than shipping a screenshot of an error
            // page onto a marketing site.
            expect(
              response?.status() ?? 0,
              `${url} returned ${response?.status()}`,
            ).toBeLessThan(400);

            // Landing back on /login means the session was lost mid-run; the
            // resulting shot would be a login page filed under a role folder.
            expect(page.url(), `${url} bounced to login`).not.toMatch(
              /\/login/,
            );

            await settle(page);

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
        // Stamped by the runner, not by the script — Date is unavailable to
        // workflow scripts and a checked-in timestamp would churn every run.
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
