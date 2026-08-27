import path from "node:path";
import { type Page, expect } from "@playwright/test";

export const USERS = {
  admin: { email: "admin@nile-academy.eg", password: "Passw0rd!" },
  teacher: { email: "hossam.aziz@nile-academy.eg", password: "Passw0rd!" },
  student: { email: "lina.hassan@student.nile-academy.eg", password: "Passw0rd!" },
  parent: { email: "mona.hassan@email.eg", password: "Passw0rd!" },
} as const;

export type Role = keyof typeof USERS;

export const STORAGE_STATE: Record<Role, string> = {
  admin: path.join(__dirname, "../../playwright/.auth/admin.json"),
  teacher: path.join(__dirname, "../../playwright/.auth/teacher.json"),
  student: path.join(__dirname, "../../playwright/.auth/student.json"),
  parent: path.join(__dirname, "../../playwright/.auth/parent.json"),
};

export async function login(page: Page, role: Role, timeout = 30_000) {
  await page.goto("/en/login", { waitUntil: "domcontentloaded" });
  await page.getByPlaceholder("you@example.com").fill(USERS[role].email);
  await page.getByPlaceholder("Enter your password").fill(USERS[role].password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(/\/dashboard/, { timeout, waitUntil: "commit" });
}

export async function quickLogin(page: Page, role: Role) {
  await page.goto("/en/login", { waitUntil: "domcontentloaded" });
  const label = role.charAt(0).toUpperCase() + role.slice(1);
  await page.getByRole("button", { name: label }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 30_000, waitUntil: "commit" });
}

export async function navigateTo(page: Page, path: string) {
  await page
    .goto(path, { waitUntil: "commit" })
    .catch((e: Error) => {
      if (!/ERR_ABORTED/.test(e.message)) throw e;
    });
  await page.waitForSelector('[data-slot="portal-content"]', { timeout: 20_000 });
}

export async function waitForTableLoad(page: Page) {
  await page.waitForFunction(
    () => !document.querySelector(".ant-spin-spinning"),
    { timeout: 15_000 },
  ).catch(() => {});
}
