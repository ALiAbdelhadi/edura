import { test as setup } from "@playwright/test";
import { login, STORAGE_STATE, type Role } from "./helpers";

const ROLES: Role[] = ["admin", "teacher", "student", "parent"];

for (const role of ROLES) {
  setup(`authenticate as ${role}`, async ({ page }) => {
    await login(page, role, 90_000);
    await page.context().storageState({ path: STORAGE_STATE[role] });
  });
}
