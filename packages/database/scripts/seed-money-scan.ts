import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PRISMA_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "prisma");

const WRITE_CALL =
  /\.(transaction|sessionSettlement)\s*\.\s*(create|createMany|update|updateMany|upsert|delete|deleteMany)\s*\(/g;
const RAW_SQL = /insert\s+into\s+(transactions|session_settlements)\b/gi;

export type SeedLedgerWrite = { file: string; line: number; match: string };

export function scanSeedsForDirectLedgerWrites(): SeedLedgerWrite[] {
  const files = readdirSync(PRISMA_DIR).filter((f) => f.endsWith(".ts") && f.includes("seed"));
  const hits: SeedLedgerWrite[] = [];
  for (const file of files) {
    const src = readFileSync(path.join(PRISMA_DIR, file), "utf8");
    const lines = src.split("\n");
    for (const re of [WRITE_CALL, RAW_SQL]) {
      re.lastIndex = 0;
      for (const m of src.matchAll(re)) {
        const line = src.slice(0, m.index).split("\n").length;
        const text = (lines[line - 1] ?? "").trimStart();
        if (text.startsWith("//") || text.startsWith("*") || text.startsWith("/*")) continue;
        hits.push({ file, line, match: m[0].trim() });
      }
    }
  }
  return hits;
}

export const ROOM_SEED_CENTER_SHORT_IDS = [
  "RATEDEMO01",
  "RATEDEMO02",
  "NILE",
  "ANDL",
  "FUTR",
  "BRGT",
] as const;
