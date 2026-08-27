import path from "node:path";
import { type Page, expect } from "@playwright/test";

export const USERS = {
  admin: { email: "admin@nile-academy.eg", password: "Passw0rd!" },
  teacher: { email: "hossam.aziz@nile-academy.eg", password: "Passw0rd!" },
  student: { email: "lina.hassan@student.nile-academy.eg", password: "Passw0rd!" },
  parent: { email: "mona.hassan@email.eg", password: "Passw0rd!" },
} as const;

export type Role = keyof typeof USERS;

/** Where `auth.setup.ts` parks each role's signed-in session. Gitignored. */
export const STORAGE_STATE: Record<Role, string> = {
  admin: path.join(__dirname, "../../playwright/.auth/admin.json"),
  teacher: path.join(__dirname, "../../playwright/.auth/teacher.json"),
  student: path.join(__dirname, "../../playwright/.auth/student.json"),
  parent: path.join(__dirname, "../../playwright/.auth/parent.json"),
};

/** `/en` is explicit: localePrefix is "always" and defaultLocale is "ar". */
export async function login(page: Page, role: Role, timeout = 30_000) {
  await page.goto("/en/login", { waitUntil: "domcontentloaded" });
  await page.getByPlaceholder("you@example.com").fill(USERS[role].email);
  await page.getByPlaceholder("Enter your password").fill(USERS[role].password);
  await page.getByRole("button", { name: /sign in/i }).click();
  // `waitUntil: "commit"` is the fix for this suite's only recurring flake, and
  // the default is the bug: waitForURL waits for "load", so it kept timing out
  // AFTER the redirect had already landed, whenever the dev server was still
  // streaming that portal's first compile. The question here is only "did the
  // sign-in redirect me to a dashboard", which "commit" answers exactly.
  // `timeout` is still raised by auth.setup.ts, which pays each portal's cold
  // compile so later specs arrive warm.
  await page.waitForURL(/\/dashboard/, { timeout, waitUntil: "commit" });
}

export async function quickLogin(page: Page, role: Role) {
  await page.goto("/en/login", { waitUntil: "domcontentloaded" });
  const label = role.charAt(0).toUpperCase() + role.slice(1);
  await page.getByRole("button", { name: label }).click();
  // "commit" for the same reason as `login` above.
  await page.waitForURL(/\/dashboard/, { timeout: 30_000, waitUntil: "commit" });
}

/**
 * Wait for the portal shell to have painted its content region.
 *
 * Was `.ant-layout-content`, which the shadcn migration removed — so this hung
 * for 20s on every current screen and the six specs calling it timed out before
 * asserting anything. There is no <main> in the portal chrome and no other
 * non-generic hook (`role="region"` is shared, and its aria-label changes per
 * screen), so `data-slot="portal-content"` was added to the shell for this.
 * See packages/ui/src/components/app-shell.tsx.
 */
export async function navigateTo(page: Page, path: string) {
  // An unprefixed path is redirected by the locale middleware (localePrefix
  // "always"), which supersedes this navigation and surfaces as
  // net::ERR_ABORTED. Tolerated, because the wait below is the real assertion:
  // if the redirect had not landed on a portal, no content region would appear.
  await page
    .goto(path, { waitUntil: "commit" })
    .catch((e: Error) => {
      if (!/ERR_ABORTED/.test(e.message)) throw e;
    });
  await page.waitForSelector('[data-slot="portal-content"]', { timeout: 20_000 });
}

/** Also broken, and always was: it ends in `.catch(() => {})`, so it resolves
 *  unconditionally and has never waited for anything. The spinner is now
 *  `role="status"`. */
export async function waitForTableLoad(page: Page) {
  await page.waitForFunction(
    () => !document.querySelector(".ant-spin-spinning"),
    { timeout: 15_000 },
  ).catch(() => {});
}
