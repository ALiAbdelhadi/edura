import { execFile } from "node:child_process";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import sharp from "sharp";
import { FLOW_LOCALES, FLOWS, outputSlug } from "./manifest";

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
  }
  return out;
}

function startAt(total: number, maxSeconds: number, mark?: number): number {
  if (mark == null) return Math.max(0, total - maxSeconds);
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

  await run("ffmpeg", [
    "-y", "-ss", String(ss), "-t", String(clipped), "-i", raw,
    "-an",
    "-c:v", "libx264", "-profile:v", "main", "-preset", "slow",
    "-crf", "26", "-pix_fmt", "yuv420p",
    "-movflags", "+faststart",
    `${stem}.mp4`,
  ]);

  await run("ffmpeg", [
    "-y", "-ss", String(ss), "-t", String(clipped), "-i", raw,
    "-an",
    "-c:v", "libvpx-vp9", "-crf", "36", "-b:v", "0",
    "-row-mt", "1", "-deadline", "good", "-cpu-used", "2",
    `${stem}.webm`,
  ]);

  const posterSecond = Math.max(0, Math.min(clipped * spec.posterFraction, clipped - 0.15));
  const posterPng = `${stem}.poster.png`;
  await run("ffmpeg", [
    "-y", "-ss", String(posterSecond), "-i", `${stem}.mp4`,
    "-frames:v", "1", posterPng,
  ]);

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
