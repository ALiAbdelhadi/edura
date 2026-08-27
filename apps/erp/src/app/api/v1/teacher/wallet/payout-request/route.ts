import { z } from "zod";
import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { requestTeacherPayout } from "@/lib/services/finance/teacher-wallet";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ amount: z.number().int().positive().optional() }).strict();

async function readAmount(req: Request): Promise<number | undefined> {
  const len = req.headers.get("content-length");
  if (!len || len === "0") return undefined;
  const body = await parseJson(req, bodySchema);
  return body.amount;
}

export const POST = withErrors(async (req) => {
  const user = await requireRole("teacher");
  return ok(await requestTeacherPayout(user, await readAmount(req)), { status: 201 });
});
