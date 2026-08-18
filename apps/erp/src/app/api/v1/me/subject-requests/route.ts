import { z } from "zod";
import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { createSubjectRequest } from "@/lib/services/catalog/onboarding";

export const dynamic = "force-dynamic";

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
