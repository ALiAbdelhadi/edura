/**
 * ============================================================================
 * FLOW ENCODER — Playwright's WebM/VP8 → mp4 (h264) + webm (vp9) + posters.
 * ============================================================================
 * Playwright records VP8 in a WebM container. That is a recording format, not
 * a delivery one: it is large, and Safari on older iOS will not play it at all.
 * The site therefore ships two sources and lets the browser choose, exactly as
 * the screenshots ship AVIF + WebP.
 *
 * WHY THE TAIL, NOT THE HEAD
 * ----------------------------------------------------------------------------
 * Each recording opens with a sign-in and a navigation — 5–8 seconds of
 * furniture nobody wants to watch. The payoff is always at the END, so the clip
 * is cut backwards from the finish rather than forwards from the start. That
 * also means the ≤8s budget is enforced by construction: a longer recording
 * simply loses more of its preamble instead of overflowing.
 *
 * Every output is MUTED at the container level (`-an`, no audio stream at all)
 * rather than by a `muted` attribute in the markup, so a clip cannot make noise
 * even if it is ever opened directly.
 *
 *   bun run encode:flows
 */
import { execFile } from "node:child_process";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import sharp from "sharp";
import { FLOWS, FLOW_LOCALES, outputSlug } from "./manifest";

const run = promisify(execFile);

const RAW = path.resolve(import.meta.dirname, "../../.flows-raw");
const OUT = path.resolve(import.meta.dirname, "../../public/flows");

async function duration(file: string): Promise<number> {
  const { stdout } = await run("ffprobe", [
    "-v", "error",
    "-show_entries", "format=duration",
    "-of", "default=noprint_wrappers=1:nokey=1",
    file,
  ]);
  return Number.parseFloat(stdout.trim());
}

/**
 * Where the recording actually becomes interesting.
 *
 * The recorder writes a mark per flow (see flows.spec.ts). It is measured from
 * the first navigation, while the video starts a few hundred ms earlier during
 * fixture setup — hence LEAD_IN, which also gives the clip a beat of settled
 * screen before anything moves rather than opening mid-keystroke.
 *
 * Falling back to a tail cut when no mark exists is deliberate: a missing mark
 * should degrade to the previous behaviour, not to a zero-length clip.
 */
const LEAD_IN = 0.6;

type Mark = { key: string; locale: string; startSec: number };

async function readMarks(): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  try {
    const raw = await readFile(path.join(RAW, "marks.jsonl"), "utf8");
    for (const line of raw.split("\n").filter(Boolean)) {
      const m = JSON.parse(line) as Mark;
      out.set(`${m.key}.${m.locale}`, m.startSec);
    }
  } catch {
    // No marks file — fall back below.
  }
  return out;
}

function startAt(total: number, maxSeconds: number, mark?: number): number {
  if (mark == null) return Math.max(0, total - maxSeconds);
  // Never trim past the end, and never leave less than a second of clip.
  return Math.max(0, Math.min(mark - LEAD_IN, total - 1));
}

async function encode(
  raw: string,
  key: string,
  locale: string,
  spec: (typeof FLOWS)[number],
  mark?: number,
) {
  const total = await duration(raw);
  const ss = startAt(total, spec.maxSeconds, mark);
  const clipped = Math.min(total - ss, spec.maxSeconds);
  const stem = path.join(OUT, `${key}.${locale}`);

  // h264 — the universal one. `yuv420p` and `profile:v main` are what make it
  // play on older iOS; without the pixel-format cast, ffmpeg keeps a 4:2:0
  // variant Safari refuses. `+faststart` moves the index to the front so the
  // clip starts before it has fully downloaded.
  await run("ffmpeg", [
    "-y", "-ss", String(ss), "-t", String(clipped), "-i", raw,
    "-an",
    "-c:v", "libx264", "-profile:v", "main", "-preset", "slow",
    "-crf", "26", "-pix_fmt", "yuv420p",
    "-movflags", "+faststart",
    `${stem}.mp4`,
  ]);

  // VP9 — smaller for the browsers that take it. `-b:v 0` is required for CRF
  // mode in libvpx-vp9; without it the CRF is treated as a ceiling on a bitrate
  // target and the file comes out far larger.
  await run("ffmpeg", [
    "-y", "-ss", String(ss), "-t", String(clipped), "-i", raw,
    "-an",
    "-c:v", "libvpx-vp9", "-crf", "36", "-b:v", "0",
    "-row-mt", "1", "-deadline", "good", "-cpu-used", "2",
    `${stem}.webm`,
  ]);

  // Poster. Taken from the ALREADY-TRIMMED mp4, at a FRACTION of the clip, so
  // it lands after the flow resolves no matter how long the recording ran.
  const posterSecond = Math.max(0, Math.min(clipped * spec.posterFraction, clipped - 0.15));
  const posterPng = `${stem}.poster.png`;
  await run("ffmpeg", [
    "-y", "-ss", String(posterSecond), "-i", `${stem}.mp4`,
    "-frames:v", "1", posterPng,
  ]);

  // Same treatment as the screenshots: AVIF + WebP, no PNG shipped.
  const png = await sharp(posterPng).toBuffer();
  await sharp(png).avif({ quality: 62, effort: 6 }).toFile(`${stem}.poster.avif`);
  await sharp(png).webp({ quality: 82, effort: 6 }).toFile(`${stem}.poster.webp`);
  await run("rm", ["-f", posterPng]);

  const size = async (f: string) => (await stat(f)).size;
  return {
    key,
    locale,
    rawSeconds: Number(total.toFixed(2)),
    clipSeconds: Number(clipped.toFixed(2)),
    trimmedFrom: Number(ss.toFixed(2)),
    posterSecond: Number(posterSecond.toFixed(2)),
    caption: spec.caption,
    files: {
      mp4: `flows/${key}.${locale}.mp4`,
      webm: `flows/${key}.${locale}.webm`,
      posterAvif: `flows/${key}.${locale}.poster.avif`,
      posterWebp: `flows/${key}.${locale}.poster.webp`,
    },
    bytes: {
      mp4: await size(`${stem}.mp4`),
      webm: await size(`${stem}.webm`),
      posterAvif: await size(`${stem}.poster.avif`),
    },
  };
}

async function main() {
  let dirs: string[];
  try {
    dirs = (await readdir(RAW, { withFileTypes: true }))
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
  } catch {
    console.error("No recordings found. Run `bun run flows` first.");
    process.exitCode = 1;
    return;
  }

  await mkdir(OUT, { recursive: true });
  const marks = await readMarks();
  if (marks.size === 0) {
    console.warn("  ! no marks.jsonl — falling back to a tail cut, which may open on a loading state.");
  }
  const rows = [];

  for (const spec of FLOWS) {
    for (const locale of FLOW_LOCALES) {
      const slug = outputSlug(spec.key, locale);
      if (!dirs.includes(slug)) {
        console.warn(`  ! missing recording: ${slug}`);
        continue;
      }
      const raw = path.join(RAW, slug, "video.webm");
      process.stdout.write(`  ${spec.key}.${locale} … `);
      const row = await encode(raw, spec.key, locale, spec, marks.get(`${spec.key}.${locale}`));
      const kb = (n: number) => `${(n / 1024).toFixed(0)} KB`;
      console.log(
        `${row.clipSeconds}s  mp4 ${kb(row.bytes.mp4)}  webm ${kb(row.bytes.webm)}  poster ${kb(row.bytes.posterAvif)}`,
      );
      rows.push(row);
    }
  }

  await writeFile(path.join(OUT, "flows.json"), `${JSON.stringify(rows, null, 2)}\n`);

  const total = rows.reduce((a, r) => a + r.bytes.mp4 + r.bytes.webm, 0);
  console.log(`\n${rows.length} clips · ${(total / 1024 / 1024).toFixed(1)} MB of video total.`);
  console.log("Loaded lazily per scene, one at a time — never all on one page.");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
