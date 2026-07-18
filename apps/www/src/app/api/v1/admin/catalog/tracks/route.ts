import { z } from "zod";
import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { listTracks, createTrack } from "@/lib/services/catalog/catalog-admin";

export const dynamic = "force-dynamic";

export const GET = withErrors(async (req) => {
  await requireRole("super_admin");
  const stageId = new URL(req.url).searchParams.get("stageId") ?? undefined;
  return ok(await listTracks(stageId));
});

const createSchema = z.object({
  code: z.string().trim().regex(/^[a-z0-9][a-z0-9-]*$/).max(64),
  stageId: z.string().uuid(),
  nameAr: z.string().trim().min(1).max(200),
  nameEn: z.string().trim().min(1).max(200).optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(10000).optional(),
});

export const POST = withErrors(async (req) => {
  await requireRole("super_admin");
  const body = await parseJson(req, createSchema);
  return ok(await createTrack(body), { status: 201 });
});
