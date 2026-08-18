import { type Page, expect } from "@playwright/test";

export const USERS = {
  admin: { email: "admin@nile-academy.eg", password: "Passw0rd!" },
  teacher: { email: "hossam.aziz@nile-academy.eg", password: "Passw0rd!" },
  student: { email: "lina.hassan@student.nile-academy.eg", password: "Passw0rd!" },
  parent: { email: "mona.hassan@email.eg", password: "Passw0rd!" },
} as const;

export type Role = keyof typeof USERS;

export async function login(page: Page, role: Role) {
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await page.getByPlaceholder("you@example.com").fill(USERS[role].email);
  await page.getByPlaceholder("Enter your password").fill(USERS[role].password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 30_000 });
}

export async function quickLogin(page: Page, role: Role) {
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  const label = role.charAt(0).toUpperCase() + role.slice(1);
  await page.getByRole("button", { name: label }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 30_000 });
}

export async function navigateTo(page: Page, path: string) {
  await page.goto(path, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".ant-layout-content", { timeout: 20_000 });
}

export async function waitForTableLoad(page: Page) {
  await page.waitForFunction(
    () => !document.querySelector(".ant-spin-spinning"),
    { timeout: 15_000 },
  ).catch(() => {});
}
