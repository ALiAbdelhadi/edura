/**
 * Walks the back office's two guided tours in a real browser.
 *
 * THE OBSTACLE THIS EXISTS TO SOLVE. 2FA is mandatory on every screen of this
 * app, so the other six portals' approach — sign in, reload, walk — cannot
 * reach a single dashboard here. And the TOTP secret is ENCRYPTED at rest, so
 * it cannot be read out of the database and reused.
 *
 * THE WAY THROUGH is the product's own enrolment flow, driven end to end:
 *
 *   sign in → `two-factor/enable` (returns the totpURI, the ONLY moment the
 *   plaintext secret exists) → compute the code → `two-factor/verify-totp`
 *   → enrolled, session valid → the dashboard → the tour opens.
 *
 * That is also why it runs against a DISPOSABLE FIXTURE and never a real
 * operator's account: enrolling binds a factor this process holds. Re-seed with
 * `prisma/backoffice-tour-fixture.ts` before each pass — it clears the previous
 * enrolment, which is what makes the run repeatable.
 */
import { test, expect, type Page } from "@playwright/test";
import { createHmac } from "node:crypto";
// Imported across the app boundary on purpose: the assertion must compare the
// walk against the REAL step lists the back office ships, not a copy that can
// drift. Playwright lives in apps/www, so the spec lives here and reaches over.
import { SUPERADMIN_TOUR_STEPS } from "../../../superadmin/src/features/tour/steps";
import { FINANCE_TOUR_STEPS } from "../../../superadmin/src/features/tour/finance-steps";

const PASSWORD = "Passw0rd!";

/** RFC 4648 base32 → bytes. The secret arrives inside the otpauth URI. */
function base32Decode(input: string): Buffer {
  const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const clean = input.replace(/=+$/, "").toUpperCase();
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = A.indexOf(ch);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** RFC 6238 TOTP: HMAC-SHA1, 30-second step, 6 digits — better-auth's default. */
function totp(secret: string, at = Date.now()): string {
  const counter = Math.floor(at / 1000 / 30);
  const buf = Buffer.alloc(8);
  buf.writeBigInt64BE(BigInt(counter));
  const hmac = createHmac("sha1", base32Decode(secret)).update(buf).digest();
  const offset = hmac[hmac.length - 1]! & 0x0f;
  const bin =
    ((hmac[offset]! & 0x7f) << 24) |
    ((hmac[offset + 1]! & 0xff) << 16) |
    ((hmac[offset + 2]! & 0xff) << 8) |
    (hmac[offset + 3]! & 0xff);
  return String(bin % 1_000_000).padStart(6, "0");
}

/** Post to better-auth from the page, so cookies ride along. */
async function authPost(page: Page, path: string, body: unknown) {
  return page.evaluate(
    async ([p, b]) => {
      const res = await fetch(`/api/auth/${p}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(b),
      });
      return { status: res.status, json: await res.json().catch(() => null) };
    },
    [path, body] as const,
  );
}

/** Sign in and get through the 2FA gate, enrolling on the way if needed. */
async function signInThrough2fa(page: Page, email: string) {
  await page.goto("/ar/login");
  await page.waitForLoadState("networkidle").catch(() => {});

  const signIn = await authPost(page, "sign-in/email", { email, password: PASSWORD });
  expect(signIn.status, `sign-in failed for ${email}`).toBeLessThan(400);

  // Already enrolled? better-auth answers with a two-factor redirect instead of
  // a session. The fixture starts clean, so this is the re-run path.
  const needsSecondFactor = Boolean(
    (signIn.json as { twoFactorRedirect?: boolean } | null)?.twoFactorRedirect,
  );
  expect(
    needsSecondFactor,
    "the fixture should start UNENROLLED — re-run prisma/backoffice-tour-fixture.ts",
  ).toBe(false);

  // Enrol: this response carries the only plaintext copy of the secret.
  const enable = await authPost(page, "two-factor/enable", { password: PASSWORD });
  expect(enable.status, "two-factor/enable failed").toBeLessThan(400);
  const uri = (enable.json as { totpURI?: string } | null)?.totpURI;
  expect(uri, "no totpURI returned").toBeTruthy();

  const secret = new URL(uri!).searchParams.get("secret");
  expect(secret, "no secret in the otpauth URI").toBeTruthy();

  const verify = await authPost(page, "two-factor/verify-totp", { code: totp(secret!) });
  expect(verify.status, "two-factor/verify-totp failed").toBeLessThan(400);
}

/**
 * Put the fixture back to UNENROLLED.
 *
 * Each test enrols, because that is the only moment the plaintext secret
 * exists. Leaving the enrolment behind would make the SECOND test in a run
 * unable to sign in at all — it would be handed a 2FA challenge whose secret
 * nothing can recompute. So every test hands the account back as it found it.
 */
/** Put the account back to "never seen the tour", through the app's own API. */
async function resetGate(page: Page) {
  await page.evaluate(async () => {
    await fetch("/api/v1/me/prefs", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tourCompleted: false }),
    });
  });
}

async function unenrol(page: Page) {
  await authPost(page, "two-factor/disable", { password: PASSWORD }).catch(() => null);
}

async function hideDevBadge(page: Page) {
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" }).catch(() => {});
}

const CASES = [
  {
    name: "super admin",
    email: "botour-super@edura.test",
    home: "/ar/dashboard/superadmin",
    steps: SUPERADMIN_TOUR_STEPS,
    namespace: "tour",
    welcome: "دي لوحة إدارة المنصة",
  },
  {
    name: "accountant",
    email: "botour-acct@edura.test",
    home: "/ar/dashboard/finance",
    steps: FINANCE_TOUR_STEPS,
    namespace: "financeTour",
    welcome: "دي لوحة الحسابات",
  },
] as const;

for (const c of CASES) {
  test(`${c.name} tour walks every card`, async ({ page }) => {
    test.setTimeout(240_000);
    await page.setViewportSize({ width: 1280, height: 900 });

    await signInThrough2fa(page, c.email);
    // Independent of whatever a previous test left behind: the gate is a
    // per-USER flag, and the first test to finish a tour would otherwise close
    // it for every test after it.
    await resetGate(page);

    await page.goto(c.home);
    await page.waitForLoadState("networkidle").catch(() => {});
    await hideDevBadge(page);

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 40_000 });
    await expect(dialog.getByText(c.welcome)).toBeVisible();

    let steps = 1;
    for (let i = 0; i < 24; i++) {
      // No card may print a raw i18n key — the failure mode that reached a
      // screen once already, since a missing key renders as its own path.
      expect(
        await dialog.locator(`text=/${c.namespace}\\./`).count(),
        `raw i18n key on card ${steps}`,
      ).toBe(0);
      const nextBtn = dialog.getByRole("button", { name: "التالي" });
      if (!(await nextBtn.isVisible().catch(() => false))) break;
      await nextBtn.click();
      steps++;
      await page.waitForTimeout(250);
    }

    await expect(dialog.getByRole("button", { name: "يلا نبدأ" })).toBeVisible();
    expect(steps).toBe(c.steps.length);

    await dialog.getByRole("button", { name: "يلا نبدأ" }).click();
    await expect(dialog).toBeHidden();
    console.log(`BACKOFFICE[${c.name}] walked ${steps} cards`);
    await unenrol(page);
  });
}

test("every anchored back-office step lands on a visible element", async ({ page }) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 1280, height: 900 });
  await signInThrough2fa(page, "botour-super@edura.test");
  await resetGate(page);
  await page.goto("/ar/dashboard/superadmin");
  await page.waitForLoadState("networkidle").catch(() => {});
  await hideDevBadge(page);

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible({ timeout: 40_000 });

  let anchored = 0;
  for (let i = 0; i < 24; i++) {
    const probe = await page.evaluate(() => {
      const spot = document.querySelector('[class*="spot"]') as HTMLElement | null;
      if (!spot) return null;
      const r = spot.getBoundingClientRect();
      return { w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top) };
    });
    if (probe) {
      anchored++;
      expect(probe.w, `card ${i} spotlight width`).toBeGreaterThan(8);
      expect(probe.h, `card ${i} spotlight height`).toBeGreaterThan(8);
    }
    const nextBtn = dialog.getByRole("button", { name: "التالي" });
    if (!(await nextBtn.isVisible().catch(() => false))) break;
    await nextBtn.click();
    await page.waitForTimeout(250);
  }

  const expected = SUPERADMIN_TOUR_STEPS.filter((s) => s.anchor).length;
  console.log(`BACKOFFICE ANCHORS: ${anchored} anchored of ${expected} expected`);
  await unenrol(page);
  expect(anchored).toBe(expected);
});
