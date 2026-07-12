import { ok } from "@/lib/http/envelope";
import { withErrors } from "@/lib/errors/http";
import { prisma } from "@repo/database";

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
