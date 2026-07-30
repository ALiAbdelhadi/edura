import { requireRole } from "@/lib/authz/require-role";
import { withErrors } from "@/lib/errors/http";
import { ok } from "@/lib/http/envelope";
import { linkGradeTrack } from "@/lib/services/catalog/catalog-admin";
import { parseJson } from "@/lib/validation/zod";
import { z } from "zod";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  gradeLevelId: z.string().uuid(),
  trackId: z.string().uuid(),
});

export const POST = withErrors(async (req) => {
  await requireRole("super_admin");
  const body = await parseJson(req, createSchema);
  return ok(await linkGradeTrack(body.gradeLevelId, body.trackId), { status: 201 });
});
