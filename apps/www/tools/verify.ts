/**
 * The checks a screenshot cannot make.
 *
 * Each one guards a decision recorded in the Design Brief, so a later edit
 * that quietly reverses it fails here rather than in review:
 *  - contrast, measured from COMPUTED colour on the ground the text sits on;
 *  - the mono face never touching Arabic text (it has no Arabic glyphs and
 *    fails silently);
 *  - the total closed with `2px double` drawn from --ink, not from --rule;
 *  - every figure isolated LTR, so no amount is reordered in Arabic;
 *  - the seal keeping its tilt AFTER its animation ends;
 *  - one accent, used once.
 *
 *   bun run --cwd apps/www-v2 verify        (dev server must be on :3010)
 */
import { chromium, type Page } from "playwright";

// Imported, NOT retyped. The counts and the destination list below are the
// whole point of these checks, and a hand-written copy of them here would go
// stale the first time someone adds a page — which is exactly what it is
// supposed to catch. (It already happened once: a `/contact` route landed
// while this file said the sitemap held 22 urls.)
import { LOCALES } from "@/i18n/config";
import { ROLE_SLUGS } from "@/i18n/roles";
import { NAV_PATHS, PUBLIC_ROUTES } from "@/lib/routes";

const BASE = process.env.CAPTURE_BASE_URL ?? "http://localhost:3010";

const results: { ok: boolean; name: string; detail: string }[] = [];
function check(ok: boolean, name: string, detail = "") {
  results.push({ ok, name, detail });
}

function srgbToLin(c: number) {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}
function luminance([r, g, b]: number[]) {
  return 0.2126 * srgbToLin(r) + 0.7152 * srgbToLin(g) + 0.0722 * srgbToLin(b);
}
function ratio(a: number[], b: number[]) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Reads a computed colour back as sRGB bytes.
 *
 * Tokens are authored in OKLCH, and `getComputedStyle` hands those back as
 * `lab(...)` / `oklch(...)` — NOT as `rgb()`. Regex-scraping the numbers out
 * of that string and treating them as RGB is how this file first reported
 * near-black on near-white as 1.5:1. Painting one pixel and reading it back is
 * the only conversion that cannot be wrong, whatever colour space arrives.
 */
async function rgbOf(page: Page, selector: string, prop: "color" | "backgroundColor") {
  return page.evaluate(
    ([sel, p]) => {
      const el = document.querySelector(sel as string);
      if (!el) return null;
      const value = getComputedStyle(el)[p as "color"];
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 1;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = value;
      ctx.fillRect(0, 0, 1, 1);
      const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
      return [r, g, b];
    },
    [selector, prop] as const,
  );
}

const browser = await chromium.launch();

for (const theme of ["light", "dark"] as const) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    colorScheme: theme,
    locale: "ar-EG",
  });
  const page = await context.newPage();
  await page.goto(`${BASE}/ar`, { waitUntil: "networkidle" });
  await page.waitForTimeout(900);

  // ── contrast, on the ground each token actually sits on ──────────────────
  const ground = (await rgbOf(page, "body", "backgroundColor"))!;
  const sheet = (await rgbOf(page, ".bg-sheet", "backgroundColor"))!;
  const pairs: [string, string, number[]][] = [
    ["h1 (--ink) on page", "h1", ground],
    ["lede (--ink-2) on page", "#main p.mt-6", ground],
    // The shared `<Eyebrow>`. It has no data attribute, so it is matched by
    // the class trio it always emits — the alternative is a bare `.text-ink-3`
    // that would match half the page and stop meaning anything.
    ["eyebrow (--ink-3) on page", "span.inline-flex.items-center.text-ink-3", ground],
    ["register label (--ink-2) on sheet", "figure .text-ink-2", sheet],
  ];
  for (const [name, selector, bg] of pairs) {
    const fg = await rgbOf(page, selector, "color");
    if (!fg) {
      check(false, `${theme} · ${name}`, `selector not found: ${selector}`);
      continue;
    }
    const r = ratio(fg, bg);
    check(r >= 4.5, `${theme} · ${name}`, `${r.toFixed(2)}:1`);
  }

  // ── the mono trap ────────────────────────────────────────────────────────
  const arabicInMono = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>(".figure")]
      .map((el) => el.textContent ?? "")
      .filter((text) => /[؀-ۿ]/.test(text)),
  );
  check(
    arabicInMono.length === 0,
    `${theme} · no Arabic inside the mono figure face`,
    arabicInMono.join(" | "),
  );

  // ── every figure is an isolated LTR run ──────────────────────────────────
  const badFigures = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>(".figure")].filter((el) => {
      const cs = getComputedStyle(el);
      return cs.direction !== "ltr" || !cs.unicodeBidi.includes("isolate");
    }).length,
  );
  check(badFigures === 0, `${theme} · every figure isolated LTR`, `${badFigures} not isolated`);

  // ── the total rule is drawn from --ink, not --rule ───────────────────────
  const total = await page.evaluate(() => {
    const el = document.querySelector(".total-rule")!;
    const cs = getComputedStyle(el);
    const ink = getComputedStyle(document.documentElement).getPropertyValue("--ink").trim();
    const probe = document.createElement("div");
    probe.style.color = ink;
    document.body.appendChild(probe);
    const inkResolved = getComputedStyle(probe).color;
    probe.style.color = cs.borderTopColor;
    const ruleResolved = getComputedStyle(probe).color;
    probe.remove();
    return { width: cs.borderTopWidth, style: cs.borderTopStyle, matchesInk: ruleResolved === inkResolved };
  });
  check(
    total.width === "2px" && total.style === "double" && total.matchesInk,
    `${theme} · total closed with 2px double --ink`,
    `${total.width} ${total.style}, from --ink: ${total.matchesInk}`,
  );

  // ── the seal keeps its tilt after the animation ends ─────────────────────
  const sealTilt = await page.evaluate(() => {
    const m = new DOMMatrixReadOnly(getComputedStyle(document.querySelector(".seal-mark")!).transform);
    return Math.round((Math.atan2(m.b, m.a) * 180) / Math.PI);
  });
  check(sealTilt === -6, `${theme} · seal still tilted after settling`, `${sealTilt}deg`);

  // ── GOLD IS A STROKE, NEVER TEXT ─────────────────────────────────────────
  // The shared system's own rule: `--gold` is for rules, borders, marks and
  // underlines, and it does NOT hold 4.5:1 at text sizes — `--gold-deep` is
  // what exists for that. This is the one way the brand accent can be misused
  // without looking obviously wrong, so it is asserted rather than trusted.
  const goldText = await page.evaluate(() => {
    const root = getComputedStyle(document.documentElement);
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = root.getPropertyValue("--gold").trim();
    const gold = ctx.fillStyle;

    return [...document.querySelectorAll<HTMLElement>("body *")]
      .filter((el) => {
        // Only elements that actually render text of their own.
        const text = [...el.childNodes]
          .filter((n) => n.nodeType === 3)
          .map((n) => n.textContent ?? "")
          .join("")
          .trim();
        if (!text) return false;
        ctx.fillStyle = getComputedStyle(el).color;
        return ctx.fillStyle === gold;
      })
      .map((el) => (el.textContent ?? "").trim().slice(0, 20));
  });
  check(goldText.length === 0, `${theme} · gold is a stroke, never text`, goldText.join(", "));

  await context.close();
}

// ══ MOTION ═════════════════════════════════════════════════════════════════

// ── the page is correct with NO JAVASCRIPT AT ALL ─────────────────────────
// The strongest check here. Everything that moves is animated with GSAP's
// `from()`, which sets the hidden state at runtime — so nothing on this page
// depends on a script to become visible, and a blocked bundle costs the
// reader decoration rather than content.
{
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    javaScriptEnabled: false,
    locale: "ar-EG",
  });
  const page = await context.newPage();
  await page.goto(`${BASE}/ar`, { waitUntil: "domcontentloaded" });

  const state = await page.evaluate(() => {
    const words = [...document.querySelectorAll<HTMLElement>("[data-ink-word]")];
    const figures = [...document.querySelectorAll<HTMLElement>(".figure")];
    return {
      headline: document.querySelector("h1")?.textContent?.trim() ?? "",
      hiddenWords: words.filter((w) => getComputedStyle(w).opacity !== "1").length,
      total: document.querySelector("[data-total-figure]")?.textContent ?? "",
      blankFigures: figures.filter((f) => !(f.textContent ?? "").trim()).length,
      sections: document.querySelectorAll("main section[id]").length,
    };
  });

  check(state.headline.length > 0, "no-JS · headline present", state.headline);
  check(state.hiddenWords === 0, "no-JS · no word hidden", `${state.hiddenWords} hidden`);
  check(state.total === "84.00", "no-JS · figures hold their real values", state.total);
  check(state.blankFigures === 0, "no-JS · no empty figure", `${state.blankFigures} blank`);
  check(state.sections === 5, "no-JS · every section rendered", `${state.sections}`);
  await context.close();
}

// ── reduced motion: nothing is constructed, so nothing has to resolve ─────
{
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    reducedMotion: "reduce",
    locale: "ar-EG",
  });
  const page = await context.newPage();
  await page.goto(`${BASE}/ar`, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);

  const calm = await page.evaluate(() => {
    const word = document.querySelector<HTMLElement>("[data-ink-word]")!;
    const spine = document.querySelector<HTMLElement>("[data-spine]")!;
    return {
      total: document.querySelector("[data-total-figure]")?.textContent ?? "",
      wordOpacity: getComputedStyle(word).opacity,
      // An inline transform here would mean a GSAP tween was built despite
      // `reduce` — the failure mode this whole arrangement exists to prevent.
      spineInline: spine.style.transform,
      spineDrawn: getComputedStyle(spine).transform,
    };
  });

  check(calm.total === "84.00", "reduce · the total never counts", calm.total);
  check(calm.wordOpacity === "1", "reduce · headline never hidden", calm.wordOpacity);
  check(calm.spineInline === "", "reduce · no tween was constructed", `inline "${calm.spineInline}"`);
  check(
    calm.spineDrawn !== "matrix(1, 0, 0, 0, 0, 0)",
    "reduce · spine simply exists, fully drawn",
    calm.spineDrawn,
  );
  await context.close();
}

// ── every control a thumb has to hit is at least 44×44, and no two overlap ─
// The visual boxes are deliberately smaller than that in the header: the
// chips are 36px and carry a 44px hit overlay. So this measures the TARGET,
// including the overlay, not the border box — and then checks that expanding
// them did not make neighbours collide, which would be worse than the small
// target it fixes.
{
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    locale: "ar-EG",
  });
  const page = await context.newPage();
  // The contact page, not the landing: it is the only one with form controls.
  await page.goto(`${BASE}/ar/contact`, { waitUntil: "networkidle" });

  const targets = await page.evaluate(() => {
    const box = (el: Element) => {
      const rect = el.getBoundingClientRect();
      const after = getComputedStyle(el, "::after");
      const w = Math.max(rect.width, Number.parseFloat(after.width) || 0);
      const h = Math.max(rect.height, Number.parseFloat(after.height) || 0);
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      return { w, h, left: cx - w / 2, right: cx + w / 2, top: cy - h / 2, bottom: cy + h / 2 };
    };

    // Form controls included: a `<select>` is as much a touch target as a
    // button, and leaving them out is how a 43px one shipped.
    const controls = [
      ...document.querySelectorAll<HTMLElement>("a[href], button, select, input, textarea"),
    ].filter(
      (el) =>
        /* `checkVisibility()`, NOT `offsetParent !== null`.
           A link inside a COLLAPSED `<details>` — the whole mobile menu —
           still reports a non-null `offsetParent` in Chromium and measures
           14px wide, so the weaker test both invents failures for controls
           nobody can touch and would miss a genuinely small one that happens
           to sit in a panel. */
        el.checkVisibility() &&
        // A link inside a CLOSED disclosure is not a touch target — nothing is
        // painted and nothing can be hit. `offsetParent` does not exclude it:
        // Chrome lays closed `<details>` content out under
        // `content-visibility: hidden` rather than `display: none`, so these
        // reported a real 14×51 box and failed a check about thumbs. The rows
        // ARE asserted at 44px, in the mobile block below, with the menu open —
        // which is the state in which they are actually touched.
        !el.closest("details:not([open])") &&
        !el.closest("[role='radio']") &&
        /* NO EXEMPTION FOR `.rule-link` ANY MORE.

           It used to be skipped here, justified as "in-page section links:
           hidden below `lg`, and pointer-only anyway" — true when only the
           desktop nav row wore the class, and false from the moment the footer
           and the page bodies did. The comment was excusing ~16 real touch
           targets per page on the grounds that they did not exist, and they
           measured 18px.

           They now carry `.rule-link-row`, which grows them to 44px under
           `(pointer: coarse)` and leaves the mouse rhythm alone, so they are
           held to the same rule as every other control instead of being
           written out of it. */
        // The skip link is a KEYBOARD affordance that is 1×1 until focused;
        // it has no thumb to accommodate. Its size while focused is asserted
        // separately below, which is the check that actually matters for it.
        !el.classList.contains("sr-only"),
    );

    /* TWO RULES, because there are two kinds of target and one rule cannot be
       right for both.

       A CONTROL — a button, a header chip, a menu row — is an object you aim
       at, so it owes 44 in BOTH axes.

       A TEXT LINK IN A LIST is different: it is as wide as its word, and
       "الشروط" is simply a short word. What makes it hard or easy to hit is
       the STACKING axis, where its neighbours are — 44px there and nothing
       within reach above or below. Demanding 44 across as well would mean
       stretching every footer link to its column's full width, which drags the
       hover underline (`inset-inline: 0`) across the whole column and breaks
       the horizontal "read next" rows that use the same class.

       So: 44×44 for controls, 44 in the stacking axis and ≥24 across for text
       links — which is stricter than the WCAG 2.2 AA floor of 24×24 on the
       axis that matters, and honest about the axis that does not. */
    const small = controls
      .map((el) => ({
        label: (el.textContent || el.getAttribute("aria-label") || "?").trim().slice(0, 18),
        text: el.classList.contains("rule-link"),
        ...box(el),
      }))
      .filter((t) => (t.text ? t.h < 44 || t.w < 24 : t.w < 44 || t.h < 44));

    const header = [...document.querySelectorAll<HTMLElement>("body > header a, body > header button")]
      .filter((el) => el.offsetParent !== null)
      .map(box);
    let overlaps = 0;
    for (let i = 0; i < header.length; i++) {
      for (let j = i + 1; j < header.length; j++) {
        const a = header[i]!;
        const b = header[j]!;
        if (a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom) overlaps++;
      }
    }
    return { small, overlaps, counted: controls.length };
  });

  check(
    targets.small.length === 0,
    "touch · every control reaches 44×44",
    targets.small.map((t) => `${t.label} ${Math.round(t.w)}×${Math.round(t.h)}`).join(", ") ||
      `${targets.counted} controls`,
  );
  check(targets.overlaps === 0, "touch · no two header targets overlap", `${targets.overlaps} overlapping`);

  // The spacing rule the `.rule-link` exemption above is answerable to: every
  // stacked text link must sit at least 24px from the next, centre to centre.
  const spacing = await page.evaluate(() => {
    const worst: { pitch: number; a: string; b: string }[] = [];
    for (const list of document.querySelectorAll("footer ul, main ul")) {
      const links = [...list.querySelectorAll<HTMLAnchorElement>("a.rule-link")].filter(
        (a) => a.offsetParent !== null,
      );
      for (let i = 1; i < links.length; i++) {
        const a = links[i - 1]!.getBoundingClientRect();
        const b = links[i]!.getBoundingClientRect();
        // Stacked, not side by side.
        if (Math.abs(b.top - a.top) < 2) continue;
        const pitch = Math.abs(b.top + b.height / 2 - (a.top + a.height / 2));
        if (pitch < 24) {
          worst.push({
            pitch: Math.round(pitch),
            a: (links[i - 1]!.textContent ?? "").trim().slice(0, 12),
            b: (links[i]!.textContent ?? "").trim().slice(0, 12),
          });
        }
      }
    }
    return worst;
  });
  check(
    spacing.length === 0,
    "touch · stacked text links sit ≥24px apart",
    spacing.map((s) => `${s.a}/${s.b} ${s.pitch}px`).join(", "),
  );

  // The skip link only exists once focused — so that is the state to measure.
  await page.keyboard.press("Tab");
  const skip = await page.evaluate(() => {
    const el = document.activeElement as HTMLElement;
    const r = el.getBoundingClientRect();
    return { text: (el.textContent || "").trim(), w: Math.round(r.width), h: Math.round(r.height) };
  });
  check(
    skip.h >= 24 && skip.w >= 44 && skip.text.length > 0,
    "keyboard · the skip link is real once focused",
    `${skip.w}×${skip.h} "${skip.text}"`,
  );
  await context.close();
}

// ── the nav carries ROUTES, and whichever page you are on marks its own ──
// The nav used to hold the landing's section anchors, which was a latent bug:
// the header renders on every page and `#money` only exists on the landing.
// It now carries two groups — the five role pages, then pricing / FAQ / trust
// — so the assertion is "every item is a real route", not a fixed count.
{
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "ar-EG" });
  const page = await context.newPage();

  const read = () =>
    page.evaluate(() => {
      const links = [...document.querySelectorAll<HTMLAnchorElement>("[data-nav-link]")];
      return {
        hrefs: links.map((a) => a.getAttribute("href") ?? ""),
        active: links.filter((a) => a.hasAttribute("data-active")).map((a) => a.getAttribute("href")),
        current: links
          .filter((a) => a.getAttribute("aria-current") === "page")
          .map((a) => a.getAttribute("href")),
      };
    });

  await page.goto(`${BASE}/ar/for/teacher`, { waitUntil: "networkidle" });
  const nav = await read();

  check(
    nav.hrefs.length === 8 && nav.hrefs.every((h) => h.startsWith("/ar/")),
    "nav · eight real routes, no dead anchors",
    nav.hrefs.join(" "),
  );
  check(
    ["/ar/pricing", "/ar/faq", "/ar/trust"].every((h) => nav.hrefs.includes(h)),
    "nav · carries pricing, FAQ and trust",
    nav.hrefs.join(" "),
  );
  // LEGAL IS FOOTER-ONLY, and that is a decision rather than an omission — so
  // it is asserted, or the next person "completes" the nav by adding it.
  check(
    !nav.hrefs.some((h) => h.includes("/privacy") || h.includes("/terms")),
    "nav · legal stays in the footer",
    nav.hrefs.join(" "),
  );
  // EXACTLY ONE marked link. Two `data-active` items would both draw the gold
  // rule and the header would claim you are on two pages at once.
  check(
    nav.active.length === 1 && nav.active[0] === "/ar/for/teacher" && nav.current[0] === "/ar/for/teacher",
    "nav · a role page marks its own link, once",
    `active=${nav.active.join(",")} aria-current=${nav.current.join(",")}`,
  );

  await page.goto(`${BASE}/ar/pricing`, { waitUntil: "networkidle" });
  const onPricing = await read();
  check(
    onPricing.active.length === 1 && onPricing.active[0] === "/ar/pricing",
    "nav · a marketing page marks its own link, once",
    `active=${onPricing.active.join(",")}`,
  );

  // The legal pages are not in the nav, so nothing may be marked on them.
  await page.goto(`${BASE}/ar/privacy`, { waitUntil: "networkidle" });
  const onPrivacy = await read();
  check(onPrivacy.active.length === 0, "nav · nothing marked on a legal page", `${onPrivacy.active.length}`);

  await context.close();
}

// ── THE MOBILE MENU ──────────────────────────────────────────────────────
// Below `lg` this site had no navigation at all. The menu is a native
// `<details>`, so the first thing asserted is the reason that was chosen: it
// opens with JavaScript DISABLED. A menu that needs a bundle is the difference
// between "does not open" and "the site cannot be navigated".
{
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    javaScriptEnabled: false,
    locale: "ar-EG",
  });
  const page = await context.newPage();
  await page.goto(`${BASE}/ar/pricing`, { waitUntil: "domcontentloaded" });

  const before = await page.evaluate(
    () => document.querySelector("[data-mobile-nav]")!.hasAttribute("open"),
  );
  await page.locator("[data-mobile-nav] > summary").click();
  const after = await page.evaluate(() => {
    const details = document.querySelector("[data-mobile-nav]")!;
    const links = [...document.querySelectorAll<HTMLAnchorElement>("[data-mobile-nav-link]")];
    return {
      open: details.hasAttribute("open"),
      visible: links.filter((l) => l.getClientRects().length > 0).length,
      // Every row a thumb has to hit.
      small: links.filter((l) => l.getBoundingClientRect().height < 44).length,
      active: links.filter((l) => l.hasAttribute("data-active")).map((l) => l.getAttribute("href")),
    };
  });

  check(!before && after.open, "mobile · the menu opens with NO JavaScript", `${before} → ${after.open}`);
  check(after.visible === 8, "mobile · all eight destinations in the panel", `${after.visible}`);
  check(after.small === 0, "mobile · every row reaches 44px", `${after.small} under`);
  check(
    after.active.length === 1 && after.active[0] === "/ar/pricing",
    "mobile · the current page is marked, once",
    after.active.join(","),
  );
  await context.close();
}

// ── EVERY DESTINATION IS REACHABLE FROM THE HEADER AT EVERY WIDTH ────────
// The inline row only gains the marketing group at `xl`, and the menu button
// hides at `xl`. Those two breakpoints have to meet exactly: one pixel of
// daylight between them is a band where three pages exist in neither, and it
// is invisible in a screenshot of any single width.
{
  for (const width of [360, 768, 1023, 1024, 1279, 1280, 1440]) {
    const context = await browser.newContext({
      viewport: { width, height: 900 },
      locale: "ar-EG",
      hasTouch: width < 1024,
      isMobile: width < 1024,
    });
    const page = await context.newPage();
    await page.goto(`${BASE}/ar/pricing`, { waitUntil: "networkidle" });

    const menu = page.locator("[data-mobile-nav] > summary");
    if ((await menu.count()) && (await menu.isVisible())) await menu.click();

    const reachable = await page.evaluate(() => {
      const shown = (el: Element) => el.getClientRects().length > 0;
      return [
        ...new Set(
          [...document.querySelectorAll<HTMLAnchorElement>("header [data-nav-link], header [data-mobile-nav-link]")]
            .filter(shown)
            .map((a) => a.getAttribute("href") ?? ""),
        ),
      ].sort();
    });

    // Derived from the same tables the nav renders from, so adding a nav
    // destination extends this check instead of quietly escaping it.
    const expected = [
      ...ROLE_SLUGS.map((r) => `/ar/for/${r}`),
      ...NAV_PATHS.map((p) => `/ar/${p}`),
    ];
    const missing = expected.filter((h) => !reachable.includes(h));
    check(missing.length === 0, `header · every destination reachable at ${width}px`, missing.join(" "));
    await context.close();
  }
}

// ── THE FOOTER IS THE COMPLETE INDEX ─────────────────────────────────────
// The header shows what fits; the footer is the only surface that shows
// everything, and it is the fallback when the menu is closed. It had listed
// three of the five role pages — the student and assistant pages were in the
// nav and in the sitemap and missing from the index — which no screenshot
// catches, because a footer with three tidy columns looks finished.
{
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "ar-EG" });
  const page = await context.newPage();
  await page.goto(`${BASE}/ar/pricing`, { waitUntil: "networkidle" });

  const footer = await page.evaluate(() => ({
    hrefs: [...document.querySelectorAll<HTMLAnchorElement>("footer a[href]")].map(
      (a) => a.getAttribute("href") ?? "",
    ),
    headings: [...document.querySelectorAll("footer nav")].map(
      (n) => n.querySelector("span,div")?.textContent?.trim() ?? "",
    ),
    columns: document.querySelectorAll("footer nav").length,
  }));

  // Every public route except the landing (which is the wordmark) is listed.
  const shouldList = PUBLIC_ROUTES.filter((r) => r.path !== "").map((r) => `/ar${r.path}`);
  const absent = shouldList.filter((h) => !footer.hrefs.includes(h));
  check(absent.length === 0, "footer · lists every public route", absent.join(" "));

  // No route listed twice — a duplicate means two columns claim the same page
  // and the taxonomy has stopped meaning anything.
  const dupes = footer.hrefs.filter((h, i) => h.startsWith("/ar") && footer.hrefs.indexOf(h) !== i);
  check(dupes.length === 0, "footer · no route listed twice", dupes.join(" "));

  check(footer.columns === 4, "footer · four labelled columns", `${footer.columns}`);
  check(
    footer.headings.every((h) => h.length > 0),
    "footer · every column is labelled",
    footer.headings.join(" | "),
  );
  await context.close();
}

// ── EVERY LINK IN THE CHROME IS IN THE SITEMAP ───────────────────────────
// A route the sitemap forgets fails silently: nothing 404s, nothing errors,
// the page simply does not exist to a crawler. So the sitemap is checked
// against what the site itself links to, not against a list someone typed —
// and the reverse direction too, because a sitemap entry with no page behind
// it is a 404 submitted to a search engine on purpose.
{
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "ar-EG" });
  const page = await context.newPage();

  const xml = await (await page.request.get(`${BASE}/sitemap.xml`)).text();
  const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]!);
  const paths = new Set(urls.map((u) => new URL(u).pathname.replace(/\/$/, "") || "/"));

  const expectedCount = PUBLIC_ROUTES.length * LOCALES.length;
  check(
    urls.length === expectedCount,
    `sitemap · every declared route × every locale`,
    `${urls.length} urls, expected ${expectedCount} (${PUBLIC_ROUTES.length} routes × ${LOCALES.length})`,
  );
  // …and it is the SAME set, not merely the same size.
  const declared = PUBLIC_ROUTES.flatMap((r) => LOCALES.map((l) => `/${l}${r.path}`));
  const notEmitted = declared.filter((p) => !paths.has(p.replace(/\/$/, "") || "/"));
  check(notEmitted.length === 0, "sitemap · no declared route missing", notEmitted.join(" "));
  check(
    urls.every((u) => !u.includes("localhost") || BASE.includes("localhost")),
    "sitemap · absolute urls, not localhost in production",
    urls[0] ?? "",
  );

  // hreflang: every entry declares both languages and an x-default.
  const alts = [...xml.matchAll(/hreflang="([^"]+)"/g)].map((m) => m[1]!);
  check(
    alts.filter((a) => a === "ar").length === urls.length &&
      alts.filter((a) => a === "en").length === urls.length &&
      alts.filter((a) => a === "x-default").length === urls.length,
    "sitemap · every entry carries ar, en and x-default",
    `ar=${alts.filter((a) => a === "ar").length} en=${alts.filter((a) => a === "en").length} x-default=${alts.filter((a) => a === "x-default").length}`,
  );
  // x-default follows DEFAULT_LOCALE (Arabic), not the usual English habit.
  const xDefault = /hreflang="x-default"\s+href="([^"]+)"/.exec(xml)?.[1] ?? "";
  check(
    new URL(xDefault || "http://x/").pathname.startsWith("/ar"),
    "sitemap · x-default is Arabic",
    xDefault,
  );

  // Now the two directions.
  for (const from of ["/ar", "/ar/pricing", "/ar/for/teacher"]) {
    await page.goto(`${BASE}${from}`, { waitUntil: "networkidle" });
    const linked = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLAnchorElement>("header a[href], footer a[href]")]
        .map((a) => a.getAttribute("href") ?? "")
        // Same-site, non-anchor links only: the app's own origin and `#`
        // targets are not this sitemap's to carry.
        .filter((h) => h.startsWith("/") && !h.includes("#")),
    );
    const missing = [...new Set(linked)].filter((h) => !paths.has(h.replace(/\/$/, "")));
    check(missing.length === 0, `sitemap · every chrome link on ${from} is listed`, missing.join(" "));
  }

  // …and every listed path actually resolves.
  for (const p of [...paths].filter((x) => x.startsWith("/ar"))) {
    const res = await page.request.get(`${BASE}${p}`);
    check(res.status() === 200, `sitemap · ${p} resolves`, `${res.status()}`);
  }

  // robots.txt points at the sitemap with an ABSOLUTE url — the one line in
  // that file for which a relative path is invalid.
  const robots = await (await page.request.get(`${BASE}/robots.txt`)).text();
  check(
    /^Sitemap:\s*https?:\/\/\S+\/sitemap\.xml$/m.test(robots),
    "robots · absolute Sitemap: directive",
    robots.split("\n").find((l) => l.startsWith("Sitemap:")) ?? robots.slice(0, 60),
  );

  await context.close();
}

// ── a backgrounded tab must never freeze a half-counted figure ───────────
// GSAP drives on rAF, which browsers throttle to a stop when the tab hides.
// These counts are `once: true`, so without a guard the reader returns to a
// wrong number that never corrects itself — on a site whose whole argument is
// that its figures are right.
{
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "ar-EG" });
  const page = await context.newPage();
  await page.goto(`${BASE}/ar/pricing`, { waitUntil: "networkidle" });
  await page.evaluate(() => {
    document.documentElement.style.scrollBehavior = "auto";
    document.getElementById("example")?.scrollIntoView();
  });
  // Catch it mid-count, then take the tab away.
  await page.waitForTimeout(120);
  const mid = await page.evaluate(
    () => document.querySelector("[data-total-figure]")?.textContent ?? "",
  );
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { value: true, configurable: true });
    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.waitForTimeout(400);

  const wrong = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>("[data-count]")]
      .filter((el) => el.textContent !== el.dataset.count)
      .map((el) => `${el.dataset.count} → ${el.textContent}`),
  );
  check(mid !== "84.00", "hidden tab · the test caught a real mid-count", `mid was ${mid}`);
  check(wrong.length === 0, "hidden tab · every figure lands on its true value", wrong.join(", "));
  await context.close();
}

// ── a tab BORN hidden still shows its content ────────────────────────────
// No `visibilitychange` fires when nothing changed, so the entrance would sit
// frozen at opacity 0 and the headline simply would not be there — for a
// ⌘-clicked tab, a crawler, or a screenshot service.
{
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "ar-EG" });
  const page = await context.newPage();
  await page.addInitScript(() => {
    Object.defineProperty(document, "hidden", { value: true, configurable: true });
    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
  });
  await page.goto(`${BASE}/ar`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);

  const hiddenState = await page.evaluate(() => {
    const words = [...document.querySelectorAll<HTMLElement>("h1 [data-ink-word]")];
    return {
      faded: words.filter((w) => getComputedStyle(w).opacity !== "1").length,
      total: words.length,
      wrong: [...document.querySelectorAll<HTMLElement>("[data-count]")].filter(
        (el) => el.textContent !== el.dataset.count,
      ).length,
    };
  });
  check(
    hiddenState.total > 0 && hiddenState.faded === 0,
    "born hidden · the headline is fully visible",
    `${hiddenState.faded}/${hiddenState.total} still faded`,
  );
  check(hiddenState.wrong === 0, "born hidden · figures hold their true values", `${hiddenState.wrong} wrong`);
  await context.close();
}

// ── a section label is a LABEL, not a sentence ───────────────────────────
// The eyebrow sits in a 9rem margin column. English runs longer than Arabic
// and takes uppercase + tracking on top, so a label that reads fine in the
// source can arrive as three stacked lines beside the heading it marks. Found
// exactly that on `en/contact`; asserted so the next one is caught here.
{
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "en-US" });
  const page = await context.newPage();
  const wrapped: string[] = [];
  for (const path of ["", "/for/center", "/pricing", "/faq", "/trust", "/contact"]) {
    await page.goto(`${BASE}/en${path}`, { waitUntil: "networkidle" });
    const found = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>("span.inline-flex.items-center.text-ink-3")]
        .map((el) => {
          const cs = getComputedStyle(el);
          const lineHeight = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.2;
          return {
            text: (el.textContent ?? "").trim(),
            lines: Math.round(el.getBoundingClientRect().height / lineHeight),
          };
        })
        .filter((x) => x.lines >= 3),
    );
    for (const f of found) wrapped.push(`en${path} "${f.text}" ${f.lines} lines`);
  }
  check(wrapped.length === 0, "type · no section label wraps past two lines", wrapped.join(", "));
  await context.close();
}

// ── the split is by WORD, never by character ─────────────────────────────
// Arabic is connected: per-character spans sever the joins and the text
// renders as isolated letterforms. It fails silently, so it is asserted.
{
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "ar-EG" });
  const page = await context.newPage();
  await page.goto(`${BASE}/ar`, { waitUntil: "networkidle" });

  const split = await page.evaluate(() => {
    const heading = document.querySelector<HTMLElement>("h1")!;
    const words = [...heading.querySelectorAll("[data-ink-word]")].map((w) => w.textContent ?? "");
    const expected = (heading.textContent ?? "").trim().split(/\s+/).filter(Boolean);
    return { words, expected, arabicSingles: words.filter((w) => /[؀-ۿ]/.test(w) && w.length === 1) };
  });

  check(
    split.words.length === split.expected.length && split.words.join(" ") === split.expected.join(" "),
    "split · one span per WORD",
    `${split.words.length} spans vs ${split.expected.length} words`,
  );
  check(
    split.arabicSingles.length === 0,
    "split · no Arabic letter split from its word",
    split.arabicSingles.join(","),
  );
  await context.close();
}

// ── scroll draws the spine, and the nav says where you are ───────────────
{
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "ar-EG" });
  const page = await context.newPage();
  await page.goto(`${BASE}/ar`, { waitUntil: "networkidle" });
  await page.waitForTimeout(500);

  const before = await page.evaluate(
    () => getComputedStyle(document.querySelector("#money [data-spine]")!).transform,
  );
  await page.evaluate(() => {
    document.documentElement.style.scrollBehavior = "auto";
    const money = document.getElementById("money")!;
    window.scrollTo(0, money.offsetTop + money.offsetHeight * 0.6);
  });
  await page.waitForTimeout(1200);
  const after = await page.evaluate(
    () => getComputedStyle(document.querySelector("#money [data-spine]")!).transform,
  );

  check(before !== after, "scroll · the spine is drawn by scrolling", `${before} → ${after}`);

  // ── the seal is inked, then pressed ────────────────────────────────────
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(2000);
  const seal = await page.evaluate(() => {
    const stroke = document.querySelector<SVGElement>("[data-seal-stroke]")!;
    const mark = document.querySelector<HTMLElement>("[data-seal]")!;
    const m = new DOMMatrixReadOnly(getComputedStyle(mark).transform);
    return {
      dash: getComputedStyle(stroke).strokeDashoffset,
      tilt: Math.round((Math.atan2(m.b, m.a) * 180) / Math.PI),
      scale: Math.round(Math.hypot(m.a, m.b) * 100) / 100,
    };
  });
  check(seal.tilt === -6, "seal · settles into its tilt", `${seal.tilt}deg`);
  check(seal.scale === 1, "seal · the press resolves to rest", `scale ${seal.scale}`);

  // ── the roles plate answers the keyboard ───────────────────────────────
  await page.evaluate(() => document.getElementById("roles")!.scrollIntoView());
  await page.waitForTimeout(300);
  const first = page.locator("[role='radio']").first();
  await first.focus();
  const startLabel = await page.evaluate(
    () => document.querySelector("[data-role-plate] figcaption")?.textContent ?? "",
  );
  await page.keyboard.press("ArrowDown");
  await page.waitForTimeout(500);
  const nextLabel = await page.evaluate(
    () => document.querySelector("[data-role-plate] figcaption")?.textContent ?? "",
  );
  check(
    startLabel !== "" && startLabel !== nextLabel,
    "roles · arrow keys move the plate, not just the pointer",
    `"${startLabel.slice(0, 24)}…" → "${nextLabel.slice(0, 24)}…"`,
  );

  await context.close();
}

await browser.close();

let failed = 0;
for (const r of results) {
  if (!r.ok) failed++;
  console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}${r.detail ? ` — ${r.detail}` : ""}`);
}
console.log(`\n${results.length - failed}/${results.length} passed`);
if (failed) process.exit(1);
