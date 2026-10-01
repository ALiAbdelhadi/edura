import { withErrors } from "@repo/server-core/errors/http";
import { ok } from "@repo/server-core/http/envelope";
import { prisma } from "@repo/database";

export const GET = withErrors(async () => {
  let db: "ok" | "unreachable" = "ok";
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    db = "unreachable";
  }
  return ok({ ok: true, now: new Date().toISOString(), db });
});
