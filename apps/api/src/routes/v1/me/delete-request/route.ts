import { z } from "zod";
import { withErrors } from "@repo/server-core/errors/http";
import { requireSession } from "@repo/server-core/erp-auth/session";
import { ok } from "@repo/server-core/http/envelope";
import { parseJson } from "@repo/server-core/validation/zod";
import { createDeletionRequest } from "@repo/server-core/services/data-rights/deletion-request";

const createSchema = z.object({
  reason: z.string().trim().min(1, "Reason is required"),
});

export const POST = withErrors(async (req) => {
  const user = await requireSession();
  const { reason } = await parseJson(req, createSchema);

  const request = await createDeletionRequest(user, reason);

  return ok(request, { status: 201 });
});
