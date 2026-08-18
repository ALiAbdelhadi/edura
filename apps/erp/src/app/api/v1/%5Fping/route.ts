import { ok } from "@/lib/http/envelope";
import { withErrors } from "@/lib/errors/http";
import { prisma } from "@repo/database";

// DEPRECATED (2026-08-08, api-modernization-audit §3): superseded by
// /api/health, which reports real database health — this route returns 200
// even when the DB is unreachable, so a monitor pointed here sees nothing.
// Kept only until every referencing script/monitor moves to /api/health;
// retire it then (it is allowlisted as public infra in route-conventions).
export const dynamic = "force-dynamic";

export const GET = withErrors(async () => {
  let db: "ok" | "unreachable" = "ok";
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    db = "unreachable";
  }
  return ok({ ok: true, now: new Date().toISOString(), db });
});
