import { z } from "zod";
import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { requestTeacherPayout } from "@/lib/services/finance/teacher-wallet";

export const dynamic = "force-dynamic";

const bodySchema = z
  .object({
    amount: z.number().int().positive().optional(),
    clientRequestId: z.string().min(8).max(64).optional(),
  })
  .strict();

async function readBody(
  req: Request,
): Promise<{ amount?: number; clientRequestId?: string }> {
  const len = req.headers.get("content-length");
  if (!len || len === "0") return {};
  return parseJson(req, bodySchema);
}

export const POST = withErrors(async (req) => {
  const user = await requireRole("teacher");
  const body = await readBody(req);
  return ok(await requestTeacherPayout(user, body.amount, body.clientRequestId), { status: 201 });
});
