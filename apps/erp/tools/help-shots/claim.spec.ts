import { test, type Page } from "@playwright/test";
import path from "node:path";

const OUT = path.join(process.cwd(), "public", "help");
const CENTER_ADMIN = { email: "admin@nile-academy.eg", password: "Passw0rd!" };

const WALK_INS = {
  ar: { fullName: "طالب لقطة الدعوة", phone: "01000000771", locale: "ar" },
  en: { fullName: "Invite Shot Student", phone: "01000000772", locale: "en" },
} as const;

async function signInAsCenterAdmin(page: Page, locale: string) {
  await page.goto(`/${locale}/login`);
  await page.getByRole("textbox").first().fill(CENTER_ADMIN.email);
  await page.locator('input[type="password"]').fill(CENTER_ADMIN.password);
  await page.getByRole("button", { name: /sign in|تسجيل الدخول/i }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 30_000 });
}

for (const locale of ["ar", "en"] as const) {
  test(`claim page — ${locale}`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 1280, height: 900 });

    await signInAsCenterAdmin(page, locale);

    const walkIn = WALK_INS[locale];
    const link = await page.evaluate(async (body) => {
      const post = async (url: string, payload: unknown) => {
        const res = await fetch(url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        });
        return { status: res.status, json: await res.json().catch(() => null) };
      };
      let r = await post("/api/v1/center/walk-in", body);
      const pick = (j: any) =>
        j?.data?.invite?.claimLink ?? j?.data?.claimLink ?? j?.claimLink ?? null;
      if (pick(r.json)) return pick(r.json);
      const studentId = r.json?.data?.studentId ?? r.json?.data?.student?.id ?? null;
      if (studentId) {
        r = await post("/api/v1/center/walk-in/resend", { studentId });
        if (pick(r.json)) return pick(r.json);
      }
      return JSON.stringify(r).slice(0, 400);
    }, walkIn);

    console.log(`WALKIN[${locale}] ->`, link);
    if (!link || !link.startsWith("http")) {
      throw new Error(`No claim link returned for ${locale}: ${link}`);
    }
    const url = new URL(link);
    await page.goto(`/${locale}/claim${url.search}`);
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.waitForTimeout(2500); // the page claims the token, then renders the form

    await page.screenshot({
      path: path.join(OUT, `student-claim-invite-${locale}.png`),
      animations: "disabled",
    });
  });
}
