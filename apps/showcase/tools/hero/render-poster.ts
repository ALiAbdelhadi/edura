import { chromium } from "@playwright/test";
import { mkdir, stat } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const BASE = process.env.VERIFY_BASE_URL ?? "http://localhost:3006";
const OUT = path.resolve(import.meta.dirname, "../../public/hero");

const POSTER_PROGRESS = 0.42;

async function main() {
  await mkdir(OUT, { recursive: true });

  const browser = await chromium.launch({
    args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"],
  });
  const page = await browser.newPage({
    viewport: { width: 1200, height: 900 },
    deviceScaleFactor: 2,
  });

  await page.goto(`${BASE}/ar`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("canvas", { timeout: 30_000 });

  await page.addStyleTag({
    content: "nextjs-portal, [data-nextjs-toast], #__next-build-watcher { display: none !important; }",
  });
  await page.waitForTimeout(2500);

  const docHeight = await page.evaluate(() => document.body.scrollHeight);
  const target = Math.round(docHeight * 0.12 * (POSTER_PROGRESS / 0.42));
  for (let i = 0; i < 400; i++) {
    const y = await page.evaluate(() => window.scrollY);
    if (y >= target - 40) break;
    await page.mouse.wheel(0, 120);
    await page.waitForTimeout(35);
  }
  await page.waitForTimeout(1200);

  const canvas = page.locator("canvas").first();
  const png = await canvas.screenshot({ omitBackground: true });
  await browser.close();

  const object = await sharp(png).trim({ threshold: 6 }).toBuffer();
  const framed = await sharp(object)
    .resize({
      width: 1080,
      height: 780,
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .extend({
      top: 60,
      bottom: 60,
      left: 60,
      right: 60,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .toBuffer();

  await sharp(framed).avif({ quality: 70, effort: 6 }).toFile(path.join(OUT, "notebook.avif"));
  await sharp(framed).webp({ quality: 88, effort: 6 }).toFile(path.join(OUT, "notebook.webp"));

  const bytes = await stat(path.join(OUT, "notebook.avif"));
  console.log(
    `hero poster → public/hero/notebook.{avif,webp}  (${(bytes.size / 1024).toFixed(0)} KB avif)`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
