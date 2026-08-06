import { expect, test as setup } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { STATE_DIR, statePath } from "./auth-state";
import { ACCOUNTS, ROLES } from "./screens";


const PASSWORD = process.env.SEED_PASSWORD ?? "Passw0rd!";

for (const role of ROLES) {
  setup(`authenticate ${role}`, async ({ page }) => {
    await mkdir(STATE_DIR, { recursive: true });

    await page.goto("/ar/login", { waitUntil: "domcontentloaded" });

    const email = page.locator('input[name="email"]');
    const password = page.locator('input[type="password"]');

    await page.waitForLoadState("networkidle").catch(() => {});
    await email.fill(ACCOUNTS[role]);
    await password.fill(PASSWORD);
    await expect(email).toHaveValue(ACCOUNTS[role]);
    await expect(password).toHaveValue(PASSWORD);

    await page.locator('button[type="submit"]').click();

    await page.waitForURL(/\/dashboard(\/|$)/, { timeout: 45_000 });
    expect(page.url()).not.toMatch(/\/login/);

    await page.context().storageState({ path: statePath(role) });
  });
}
