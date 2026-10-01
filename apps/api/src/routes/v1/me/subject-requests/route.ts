import { z } from "zod";
import { withErrors } from "@repo/server-core/errors/http";
import { requireRole } from "@repo/server-core/authz/require-role";
import { ok } from "@repo/server-core/http/envelope";
import { parseJson } from "@repo/server-core/validation/zod";
import { createSubjectRequest } from "@repo/server-core/services/catalog/onboarding";

const createSchema = z.object({
  suggestedName: z.string().trim().min(2).max(200),
  gradeLevelId: z.string().uuid().nullish(),
  notes: z.string().trim().max(1000).nullish(),
});

export const POST = withErrors(async (req) => {
  const user = await requireRole("teacher");
  const body = await parseJson(req, createSchema);
  return ok(await createSubjectRequest(user, body), { status: 201 });
});
