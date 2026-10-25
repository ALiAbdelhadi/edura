import { chromium, type Page } from "playwright";

import { LOCALES } from "@/i18n/config";
import { getPages } from "@/i18n/pages";
import { PUBLIC_ROUTES } from "@/lib/routes";

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

async function scrollThrough(page: Page) {
  await page.evaluate(async () => {
    document.documentElement.style.scrollBehavior = "auto";
    const step = window.innerHeight * 0.6;
    for (let y = 0; y < document.body.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise((resolve) => setTimeout(resolve, 90));
    }
    window.scrollTo(0, document.body.scrollHeight);
    await new Promise((resolve) => setTimeout(resolve, 200));
  });
  await page.waitForTimeout(1500);
}

async function openHome(page: Page, locale: string, wait: "networkidle" | "domcontentloaded" = "networkidle") {
  await page.goto(`${BASE}/${locale}`, { waitUntil: wait });
  if (wait === "networkidle") {
    await page
      .waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running"), null, {
        timeout: 6000,
      })
      .catch(() => {});
  }
}

const SECTION_IDS = ["subjects", "teachers", "how", "roles", "pay", "safety", "faq", "start"];
const MARKER_RGB = "255,225,74";

const browser = await chromium.launch(process.env.CAPTURE_CHANNEL ? { channel: process.env.CAPTURE_CHANNEL } : {});

// 1 · no horizontal overflow, 2 · no console errors, 3 · landmarks present
for (const locale of ["ar", "en"] as const) {
  for (const width of [390, 1024, 1440]) {
    const context = await browser.newContext({
      viewport: { width, height: 900 },
      locale: locale === "ar" ? "ar-EG" : "en-US",
      hasTouch: width < 1024,
      isMobile: width < 1024,
    });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    page.on("pageerror", (e) => errors.push(String(e)));

    await openHome(page, locale);
    await scrollThrough(page);

    const overflow = await page.evaluate(() => ({
      by: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      wide: [...document.querySelectorAll<HTMLElement>("main *")]
        .filter((el) => {
          const r = el.getBoundingClientRect();
          return (
            r.width > 0 &&
            (r.right > window.innerWidth + 1 || r.left < -1) &&
            !el.closest("[aria-hidden='true']") &&
            !el.closest("[class*='overflow-hidden'], [class*='overflow-x']")
          );
        })
        .slice(0, 3)
        .map((el) => `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 30)}`),
    }));
    check(
      overflow.by <= 0,
      `${locale} · no horizontal overflow at ${width}px`,
      overflow.by > 0 ? `${overflow.by}px wider; sticking out: ${overflow.wide.join(", ")}` : "",
    );
    check(errors.length === 0, `${locale} · no console errors at ${width}px`, errors[0] ?? "");

    if (width === 1440) {
      const present = await page.evaluate(
        ([ids]) => ({
          missingIds: (ids as string[]).filter((id) => !document.getElementById(id)),
          h1: document.querySelectorAll("main h1#hero-title").length,
          weekClasses: document.querySelectorAll(".home-week .home-week-class").length,
        }),
        [SECTION_IDS] as const,
      );
      check(
        present.missingIds.length === 0,
        `${locale} · every homepage section present`,
        present.missingIds.length ? `missing #${present.missingIds.join(", #")}` : SECTION_IDS.map((i) => `#${i}`).join(" "),
      );
      check(
        present.h1 === 1 && present.weekClasses > 0,
        `${locale} · one hero h1 and the sample week present`,
        JSON.stringify(present),
      );
    }
    await context.close();
  }
}

// contrast on both themes
for (const theme of ["light", "dark"] as const) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    colorScheme: theme,
    locale: "ar-EG",
  });
  const page = await context.newPage();
  await openHome(page, "ar");
  const ground = (await rgbOf(page, "body", "backgroundColor"))!;
  for (const [name, selector] of [
    ["h1 (--ink) on page", "main h1"],
    ["hero lede on page", "#hero-title + p"],
  ] as const) {
    const fg = await rgbOf(page, selector, "color");
    if (!fg) {
      check(false, `${theme} · ${name}`, `selector not found: ${selector}`);
      continue;
    }
    const r = ratio(fg, ground);
    check(r >= 4.5, `${theme} · ${name}`, `${r.toFixed(2)}:1`);
  }

  // highlighter yellow is a background only, never a text colour inside <main>
  await scrollThrough(page);
  const yellowText = await page.evaluate((marker) => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    const cache = new Map<string, string>();
    const rgb = (value: string) => {
      let hit = cache.get(value);
      if (hit === undefined) {
        ctx.clearRect(0, 0, 1, 1);
        ctx.fillStyle = value;
        ctx.fillRect(0, 0, 1, 1);
        const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
        hit = `${r},${g},${b}`;
        cache.set(value, hit);
      }
      return hit;
    };
    return [...document.querySelectorAll<HTMLElement>("main *")]
      .filter((el) => {
        const own = [...el.childNodes]
          .filter((n) => n.nodeType === 3)
          .map((n) => n.textContent ?? "")
          .join("")
          .trim();
        return own && rgb(getComputedStyle(el).color) === marker;
      })
      .map((el) => `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 40)} "${(el.textContent ?? "").trim().slice(0, 24)}"`);
  }, MARKER_RGB);
  check(yellowText.length === 0, `${theme} · marker yellow is never a text colour in <main>`, yellowText.join(", "));
  await context.close();
}

// the subject cards
for (const locale of ["ar", "en"] as const) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: locale === "ar" ? "ar-EG" : "en-US",
  });
  const page = await context.newPage();
  await openHome(page, locale);
  await page.locator("#subjects").scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);

  const cards = page.locator("#subjects .subject-card");
  const names = () => cards.allTextContents().then((all) => all.join("|"));
  const pills = page.locator("#subjects [role=group] button.chip");

  check((await pills.count()) === 5, `${locale} · cards · five stage pills`, `${await pills.count()}`);
  const first = await cards.count();
  check(first === 8, `${locale} · cards · a stage opens on eight cards`, `${first}`);
  check(
    (await page.locator("#subjects .subject-card svg").count()) === first,
    `${locale} · cards · every card has its picture`,
    "",
  );

  const toggle = page.locator("#subjects button[aria-expanded]");
  await toggle.click();
  await page.waitForTimeout(150);
  const expanded = await cards.count();
  check(expanded > first, `${locale} · cards · "show all" adds the rest`, `${first} → ${expanded}`);

  const before = await names();
  await pills.first().click();
  await page.waitForTimeout(150);
  const after = await names();
  check(
    after !== before && (await pills.first().getAttribute("aria-pressed")) === "true",
    `${locale} · cards · another stage pill swaps the cards`,
    "",
  );
  await context.close();
}

// hidden tab: the hero still lands
{
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "ar-EG" });
  const page = await context.newPage();
  await page.addInitScript(() => {
    Object.defineProperty(document, "hidden", { value: true, configurable: true });
    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
  });
  await page.goto(`${BASE}/ar`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  const state = await page.evaluate(() => ({
    faded: [...document.querySelectorAll<HTMLElement>("[data-rise]")].filter(
      (el) => getComputedStyle(el).opacity !== "1",
    ).length,
  }));
  check(state.faded === 0, "born hidden · hero visible", JSON.stringify(state));
  await context.close();
}

// reduced motion
{
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    reducedMotion: "reduce",
    locale: "ar-EG",
  });
  const page = await context.newPage();
  await openHome(page, "ar");
  await page.waitForTimeout(300);
  const calm = await page.evaluate(() => ({
    faded: [...document.querySelectorAll<HTMLElement>("[data-reveal], [data-rise]")].filter(
      (el) => getComputedStyle(el).opacity !== "1",
    ).length,
  }));
  check(
    calm.faded === 0,
    "reduce · nothing hidden, nothing moves",
    JSON.stringify(calm),
  );
  await context.close();
}

// every link into the ERP is a register or login door
for (const locale of ["ar", "en"] as const) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: locale === "ar" ? "ar-EG" : "en-US",
  });
  const page = await context.newPage();
  await page.goto(`${BASE}/${locale}`, { waitUntil: "domcontentloaded" });
  const links = await page.evaluate(() => {
    const own = location.origin;
    return [...document.querySelectorAll<HTMLAnchorElement>("a[href]")]
      .map((a) => a.href)
      .filter((h) => /^https?:/.test(h) && new URL(h).origin !== own);
  });
  const bad = links.filter((h) => !/\/(register|login)(\?|$|\/|#)/.test(new URL(h).pathname + new URL(h).search));
  check(
    links.length > 0 && bad.length === 0,
    `${locale} · every outbound app link goes to /register or /login`,
    bad.length ? bad.join(", ") : `${links.length} links`,
  );
  await context.close();
}

// no JavaScript
for (const locale of ["ar", "en"] as const) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    javaScriptEnabled: false,
    locale: locale === "ar" ? "ar-EG" : "en-US",
  });
  const page = await context.newPage();
  await page.goto(`${BASE}/${locale}`, { waitUntil: "domcontentloaded" });
  const h1 = page.locator("main h1");
  const picker = page.locator("#subjects");
  const state = {
    h1: await h1.isVisible(),
    picker: await picker.isVisible(),
    pickerTiles: await page.locator("#subjects .subject-card").count(),
    sections: await page.locator(SECTION_IDS.map((id) => `#${id}`).join(", ")).count(),
  };
  check(
    state.h1 && state.picker && state.pickerTiles > 0,
    `${locale} · no-JS · h1 and the subject cards are visible`,
    JSON.stringify(state),
  );
  check(
    state.sections === SECTION_IDS.length,
    `${locale} · no-JS · all sections rendered`,
    `${state.sections}/${SECTION_IDS.length} sections`,
  );
  await context.close();
}

// header + chrome
{
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "ar-EG" });
  const page = await context.newPage();
  const read = () =>
    page.evaluate(() => {
      const links = [...document.querySelectorAll<HTMLAnchorElement>("[data-nav-link]")];
      return {
        hrefs: links.map((a) => a.getAttribute("href") ?? ""),
        active: links.filter((a) => a.hasAttribute("data-active")).map((a) => a.getAttribute("href")),
      };
    });

  await page.goto(`${BASE}/ar`, { waitUntil: "networkidle" });
  const nav = await read();
  check(
    nav.hrefs.length === 5 && nav.hrefs.every((h) => h.startsWith("/ar")) && nav.active.length === 0,
    "nav · five destinations, none marked on the homepage",
    nav.hrefs.join(" "),
  );
  const anchors = nav.hrefs.filter((h) => h.includes("#")).map((h) => h.split("#")[1]!);
  const dead = await page.evaluate((ids) => ids.filter((id) => !document.getElementById(id)), anchors);
  check(dead.length === 0, "nav · every in-page anchor has a target", dead.join(" "));

  await page.goto(`${BASE}/ar/pricing`, { waitUntil: "networkidle" });
  const onPricing = await read();
  check(
    onPricing.active.length === 1 && onPricing.active[0] === "/ar/pricing",
    "nav · a marketing page marks its own link, once",
    `active=${onPricing.active.join(",")}`,
  );
  await page.goto(`${BASE}/ar/privacy`, { waitUntil: "networkidle" });
  const onPrivacy = await read();
  check(onPrivacy.active.length === 0, "nav · nothing marked on a legal page", `${onPrivacy.active.length}`);
  await context.close();
}

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
  const before = await page.evaluate(() => document.querySelector("[data-mobile-nav]")!.hasAttribute("open"));
  await page.locator("[data-mobile-nav] > summary").click();
  const after = await page.evaluate(() => {
    const links = [...document.querySelectorAll<HTMLAnchorElement>("[data-mobile-nav-link]")];
    return {
      open: document.querySelector("[data-mobile-nav]")!.hasAttribute("open"),
      visible: links.filter((l) => l.getClientRects().length > 0).length,
      small: links.filter((l) => l.getBoundingClientRect().height < 44).length,
      active: links.filter((l) => l.hasAttribute("data-active")).map((l) => l.getAttribute("href")),
    };
  });
  check(!before && after.open, "mobile · the menu opens with NO JavaScript", `${before} → ${after.open}`);
  check(after.visible === 5, "mobile · all five destinations in the panel", `${after.visible}`);
  check(after.small === 0, "mobile · every row reaches 44px", `${after.small} under`);
  check(
    after.active.length === 1 && after.active[0] === "/ar/pricing",
    "mobile · the current page is marked, once",
    after.active.join(","),
  );
  await context.close();
}

{
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "ar-EG" });
  const page = await context.newPage();
  await page.goto(`${BASE}/ar/pricing`, { waitUntil: "networkidle" });
  const footer = await page.evaluate(() => ({
    hrefs: [...document.querySelectorAll<HTMLAnchorElement>("footer a[href]")].map((a) => a.getAttribute("href") ?? ""),
    headings: [...document.querySelectorAll("footer nav")].map((n) => n.querySelector("p")?.textContent?.trim() ?? ""),
    columns: document.querySelectorAll("footer nav").length,
  }));
  const shouldList = PUBLIC_ROUTES.filter((r) => r.path !== "").map((r) => `/ar${r.path}`);
  const absent = shouldList.filter((h) => !footer.hrefs.includes(h));
  check(absent.length === 0, "footer · lists every public route", absent.join(" "));
  const dupes = footer.hrefs.filter((h, i) => h.startsWith("/ar") && footer.hrefs.indexOf(h) !== i);
  check(dupes.length === 0, "footer · no route listed twice", dupes.join(" "));
  check(footer.columns === 4 && footer.headings.every((h) => h.length > 0), "footer · four labelled columns", footer.headings.join(" | "));
  await context.close();
}

{
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    locale: "ar-EG",
  });
  const page = await context.newPage();
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

    const controls = [
      ...document.querySelectorAll<HTMLElement>("a[href], button, select, input, textarea"),
    ].filter(
      (el) =>
        el.checkVisibility() &&
        !el.closest("details:not([open])") &&
        !el.closest("[role='radio']") &&

        !el.classList.contains("sr-only"),
    );

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

  const spacing = await page.evaluate(() => {
    const worst: { pitch: number; a: string; b: string }[] = [];
    for (const list of document.querySelectorAll("footer ul, main ul")) {
      const links = [...list.querySelectorAll<HTMLAnchorElement>("a.rule-link")].filter(
        (a) => a.offsetParent !== null,
      );
      for (let i = 1; i < links.length; i++) {
        const a = links[i - 1]!.getBoundingClientRect();
        const b = links[i]!.getBoundingClientRect();
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
  const declared = PUBLIC_ROUTES.flatMap((r) => LOCALES.map((l) => `/${l}${r.path}`));
  const notEmitted = declared.filter((p) => !paths.has(p.replace(/\/$/, "") || "/"));
  check(notEmitted.length === 0, "sitemap · no declared route missing", notEmitted.join(" "));
  check(
    urls.every((u) => !u.includes("localhost") || BASE.includes("localhost")),
    "sitemap · absolute urls, not localhost in production",
    urls[0] ?? "",
  );

  const alts = [...xml.matchAll(/hreflang="([^"]+)"/g)].map((m) => m[1]!);
  check(
    alts.filter((a) => a === "ar").length === urls.length &&
      alts.filter((a) => a === "en").length === urls.length &&
      alts.filter((a) => a === "x-default").length === urls.length,
    "sitemap · every entry carries ar, en and x-default",
    `ar=${alts.filter((a) => a === "ar").length} en=${alts.filter((a) => a === "en").length} x-default=${alts.filter((a) => a === "x-default").length}`,
  );
  const xDefault = /hreflang="x-default"\s+href="([^"]+)"/.exec(xml)?.[1] ?? "";
  check(
    new URL(xDefault || "http://x/").pathname.startsWith("/ar"),
    "sitemap · x-default is Arabic",
    xDefault,
  );

  for (const from of ["/ar", "/ar/pricing", "/ar/for/student"]) {
    await page.goto(`${BASE}${from}`, { waitUntil: "networkidle" });
    const linked = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLAnchorElement>("header a[href], footer a[href]")]
        .map((a) => a.getAttribute("href") ?? "")
        .filter((h) => h.startsWith("/") && !h.includes("#")),
    );
    const missing = [...new Set(linked)].filter((h) => !paths.has(h.replace(/\/$/, "")));
    check(missing.length === 0, `sitemap · every chrome link on ${from} is listed`, missing.join(" "));
  }

  for (const p of [...paths].filter((x) => x.startsWith("/ar"))) {
    const res = await page.request.get(`${BASE}${p}`);
    check(res.status() === 200, `sitemap · ${p} resolves`, `${res.status()}`);
  }

  const robots = await (await page.request.get(`${BASE}/robots.txt`)).text();
  check(
    /^Sitemap:\s*https?:\/\/\S+\/sitemap\.xml$/m.test(robots),
    "robots · absolute Sitemap: directive",
    robots.split("\n").find((l) => l.startsWith("Sitemap:")) ?? robots.slice(0, 60),
  );

  await context.close();
}

// the 404 is rendered in the browser, so it has to find its own locale and theme
{
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "ar-EG" });
  await context.addInitScript(() => localStorage.setItem("linktich-v2-theme", "dark"));
  const page = await context.newPage();
  for (const locale of ["ar", "en"] as const) {
    const res = await page.goto(`${BASE}/${locale}/no-such-page`, { waitUntil: "networkidle" });
    check(res?.status() === 404, `404 · /${locale} unknown path answers 404`, `${res?.status()}`);
    const nf = await page.evaluate(() => ({
      title: document.title,
      lang: document.documentElement.lang,
      theme: document.documentElement.dataset.theme,
      home: document.querySelector("main a.btn-pen")?.getAttribute("href"),
    }));
    check(nf.title === getPages(locale).notFound.meta, `404 · /${locale} title is localized`, nf.title);
    check(nf.lang === locale, `404 · /${locale} html lang`, nf.lang);
    check(nf.theme === "dark", `404 · /${locale} applies the stored theme`, `${nf.theme}`);
    check(nf.home === `/${locale}`, `404 · /${locale} links back into the site`, JSON.stringify(nf));
  }

  for (const locale of ["ar", "en"] as const) {
    await page.goto(`${BASE}/${locale}/pricing`, { waitUntil: "domcontentloaded" });
    const meta = await page.evaluate(() => ({
      og: document.querySelector('meta[property="og:image"]')?.getAttribute("content") ?? "",
      card: document.querySelector('meta[name="twitter:card"]')?.getAttribute("content") ?? "",
    }));
    check(
      /^https?:\/\/.+\/og\/(ar|en)\.png$/.test(meta.og) && meta.og.endsWith(`/og/${locale}.png`),
      `share · /${locale} og:image is its locale's absolute card`,
      meta.og,
    );
    check(meta.card === "summary_large_image", `share · /${locale} twitter:card`, meta.card);
  }

  for (const asset of [`/og/ar.png`, `/og/en.png`, "/favicon.ico", "/apple-icon.png", "/icon.svg"]) {
    const res = await page.request.get(`${BASE}${asset}`);
    check(res.status() === 200, `brand · ${asset} served`, `${res.status()}`);
  }

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
