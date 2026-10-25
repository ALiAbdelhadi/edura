import { readFileSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";

import { getMessages } from "../src/i18n/messages";

// Renders the raster brand files from src/app/icon.svg and the hero copy:
// public/og/{ar,en}.png (1200x630 share cards), src/app/apple-icon.png and
// src/app/favicon.ico. Re-run after changing the mark or the hero headline.
// Needs network for the Google Fonts stylesheet.

const ROOT = new URL("../", import.meta.url).pathname;
const icon = readFileSync(`${ROOT}src/app/icon.svg`, "utf8").replace(/<!--[\s\S]*?-->/g, "");
const FONTS =
  '<link href="https://fonts.googleapis.com/css2?family=Readex+Pro:wght@300;400;500&display=block" rel="stylesheet">';

function card(locale: "ar" | "en") {
  const t = getMessages(locale);
  const ar = locale === "ar";
  const { days, classes } = t.hero.week;
  // The hero's sample week: six days, four rows, the same cells the page shows.
  const cells = [0, 1, 2, 3]
    .flatMap((slot) =>
      days.map((_, day) => {
        const c = classes.find((x) => x.day === day && x.slot === slot);
        if (!c) return '<div class="cell"></div>';
        return `<div class="cell ${c.next ? "next" : "mine"}"><b>${c.subject}</b><span>${c.time}</span></div>`;
      }),
    )
    .join("");

  return `<!doctype html><html lang="${locale}" dir="${ar ? "rtl" : "ltr"}"><head><meta charset="utf-8">${FONTS}<style>
  *{margin:0;box-sizing:border-box}
  body{width:1200px;height:630px;overflow:hidden;background:#f3f4f0;color:#1b1f1d;font-family:"Readex Pro",sans-serif;display:grid;grid-template-columns:1fr 470px;gap:64px;padding:72px 88px}
  .copy{display:flex;flex-direction:column}
  .brand{display:flex;align-items:center;gap:14px}
  .brand svg{width:52px;height:52px}
  .brand span{font-weight:500;font-size:34px}
  h1{margin-top:auto;font-weight:500;font-size:${ar ? 76 : 64}px;line-height:1.2;letter-spacing:${ar ? "0" : "-.02em"}}
  .note{margin-top:24px;font-size:26px;font-weight:300;color:#56605b;line-height:1.6}
  .week{align-self:center;display:grid;grid-template-columns:repeat(6,1fr);gap:8px}
  .day{font-size:15px;color:#5e6863;text-align:center;padding-bottom:4px}
  .cell{height:96px;border:1px solid #dfe3dc;border-radius:12px;background:#fff;display:flex;flex-direction:column;justify-content:center;align-items:center;gap:4px;text-align:center}
  .cell b{font-weight:500;font-size:16px}
  .cell span{font-size:12px;color:#56605b}
  .mine{background:#1e3a32;border-color:#1e3a32;color:#f3f4f0}
  .mine span{color:#c5d3cb}
  .next{background:#f2e6b8;border-color:#f2e6b8}
</style></head><body>
<div class="copy"><div class="brand">${icon}<span>${ar ? "لينكتك" : "Linktich"}</span></div>
<h1>${t.hero.title}</h1>
<p class="note">${t.hero.lede}</p></div>
<div class="week">${days.map((d) => `<div class="day">${d}</div>`).join("")}${cells}</div>
</body></html>`;
}

// An .ico is a directory of PNGs; every browser since IE Vista reads PNG entries.
function ico(pngs: { size: number; data: Buffer }[]) {
  const header = Buffer.alloc(6 + 16 * pngs.length);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngs.length, 4);
  let offset = header.length;
  pngs.forEach(({ size, data }, i) => {
    const entry = 6 + 16 * i;
    header.writeUInt8(size, entry);
    header.writeUInt8(size, entry + 1);
    header.writeUInt16LE(1, entry + 4);
    header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(data.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += data.length;
  });
  return Buffer.concat([header, ...pngs.map((png) => png.data)]);
}

const browser = await chromium.launch(process.env.CAPTURE_CHANNEL ? { channel: process.env.CAPTURE_CHANNEL } : {});
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });

for (const locale of ["ar", "en"] as const) {
  await page.setContent(card(locale), { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `${ROOT}public/og/${locale}.png` });
}

async function renderIcon(svg: string, size: number) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<style>*{margin:0}html,body{background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`);
  return page.screenshot({ omitBackground: true });
}

// iOS rounds the corners itself, so the touch icon is the full square.
writeFileSync(`${ROOT}src/app/apple-icon.png`, await renderIcon(icon.replace('rx="14"', 'rx="0"'), 180));

const sizes = [16, 32, 48];
const pngs = [];
for (const size of sizes) pngs.push({ size, data: await renderIcon(icon, size) });
writeFileSync(`${ROOT}src/app/favicon.ico`, ico(pngs));

await browser.close();
console.log("brand assets: public/og/ar.png, public/og/en.png, src/app/apple-icon.png, src/app/favicon.ico");
