import { expect, test, type Page } from "@playwright/test";

const FLIPPED = [
  "/en/changelog",
  "/en/claim",
  "/en/contact",
  "/en/faq",
  "/en/forgot-password",
  "/en/help",
  "/en/help/create-group",
  "/en/invite/accept",
  "/en/login",
  "/en/privacy",
  "/en/register",
  "/en/reset-password",
  "/en/terms",
  "/en/two-factor",
  "/en/ui-preview",
];

const A = { email: "lina.hassan@student.nile-academy.eg", password: "Passw0rd!", name: "Lina" };
const B = { email: "salma.tarek@student.nile-academy.eg", password: "Passw0rd!", name: "Salma" };

async function signIn(page: Page, who: { email: string; password: string }) {
  await page.goto("/en/login", { waitUntil: "domcontentloaded" });
  await page.getByPlaceholder("you@example.com").fill(who.email);
  await page.getByPlaceholder("Enter your password").fill(who.password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 30_000 });
}

async function bodyOf(page: Page, path: string): Promise<string> {
  const res = await page.request.get(path);
  expect(res.status(), `${path} should not error`).toBeLessThan(400);
  const html = await res.text();
  return (
    html
      .replace(/"buildId":"[^"]*"/g, '"buildId":"X"')
      .replace(/nonce="[^"]*"/g, 'nonce="X"')
      .replace(/\?dpl=[\w]+/g, "?dpl=X")
      .replace(/self\.__next_f\.push\(\[1,"[0-9a-f]+:/g, 'push([1,"X:')
  );
}

test.describe("Gate 3 — a prerendered route serves the same bytes to everybody", () => {
  test("anonymous, student A and student B receive identical HTML on all 15 flipped routes", async ({
    browser,
  }) => {
    const anon = await browser.newContext();
    const ctxA = await browser.newContext();
    const ctxB = await browser.newContext();
    const [pAnon, pA, pB] = await Promise.all([anon.newPage(), ctxA.newPage(), ctxB.newPage()]);

    await signIn(pA, A);
    await signIn(pB, B);

    const divergent: string[] = [];
    const leaked: string[] = [];

    for (const route of FLIPPED) {
      const [hAnon, hA, hB] = [
        await bodyOf(pAnon, route),
        await bodyOf(pA, route),
        await bodyOf(pB, route),
      ];

      if (hAnon !== hA || hAnon !== hB) divergent.push(route);

      for (const [who, needle] of [
        ["A", A.email],
        ["A", A.name],
        ["B", B.email],
        ["B", B.name],
      ] as const) {
        if (hA.includes(needle) || hB.includes(needle) || hAnon.includes(needle)) {
          leaked.push(`${route} carries ${who}'s ${needle}`);
        }
      }
    }

    expect(divergent, "routes whose HTML depended on who asked").toEqual([]);
    expect(leaked, "user identifiers found in a build-time-rendered page").toEqual([]);

    await Promise.all([anon.close(), ctxA.close(), ctxB.close()]);
  });
});

test.describe("Gate 4 — the portals still render after identity moved out of the root layout", () => {
  const ROLES = [
    { role: "student", user: A, home: "/en/dashboard/student", also: ["/en/dashboard/student/wallet", "/en/dashboard/student/schedule"] },
    { role: "parent", user: { email: "mona.hassan@email.eg", password: "Passw0rd!" }, home: "/en/dashboard/parent", also: ["/en/dashboard/parent/children"] },
    { role: "teacher", user: { email: "hossam.aziz@nile-academy.eg", password: "Passw0rd!" }, home: "/en/dashboard/teacher", also: ["/en/dashboard/teacher/classes"] },
    { role: "admin", user: { email: "admin@nile-academy.eg", password: "Passw0rd!" }, home: "/en/dashboard/admin", also: ["/en/dashboard/admin/students"] },
  ];

  for (const { role, user, home, also } of ROLES) {
    test(`${role} portal loads with no console errors`, async ({ page }) => {
      const errors: string[] = [];
      const failed: string[] = [];
      page.on("console", (m) => {
        if (m.type() === "error") errors.push(m.text());
      });
      page.on("pageerror", (e) => errors.push(String(e)));
      page.on("response", (r) => {
        if (r.status() >= 400) failed.push(`${r.status()} ${new URL(r.url()).pathname}`);
      });

      await signIn(page, user);
      for (const path of [home, ...also]) {
        const res = await page.goto(path, { waitUntil: "domcontentloaded" });
        expect(res?.status(), `${path}`).toBeLessThan(400);
        await expect(page.locator("main, [data-portal]").first()).toBeVisible({ timeout: 20_000 });
      }

      const real = errors.filter(
        (e) => !/favicon|manifest|sw\.js|status of 40[14]/i.test(e),
      );
      expect(real, `${role} console errors`).toEqual([]);
      console.log(`[gate4] ${role} non-2xx responses: ${JSON.stringify([...new Set(failed)])}`);
    });
  }
});
