import { z } from "zod";
import { withErrors } from "@repo/server-core/errors/http";
import { requireRole } from "@repo/server-core/authz/require-role";
import { ok } from "@repo/server-core/http/envelope";
import { parseJson } from "@repo/server-core/validation/zod";
import { requestTeacherPayout } from "@repo/server-core/services/finance/teacher-wallet";

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
