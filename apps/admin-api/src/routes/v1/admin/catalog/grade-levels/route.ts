import { withRole } from "@repo/server-core/backoffice-auth/require-role";
import { ok } from "@repo/server-core/http/envelope";
import { createGradeLevel, listGradeLevels } from "@repo/server-core/services/catalog/catalog-admin";
import { parseJson } from "@repo/server-core/validation/zod";
import { z } from "zod";

export const GET = withRole("super_admin", async (_user, req) => {
  const stageId = new URL(req.url).searchParams.get("stageId") ?? undefined;
  return ok(await listGradeLevels(stageId));
});

const createSchema = z.object({
  code: z.string().trim().regex(/^[a-z0-9][a-z0-9-]*$/).max(64),
  stageId: z.string().uuid(),
  nameAr: z.string().trim().min(1).max(200),
  nameEn: z.string().trim().min(1).max(200).optional(),
  level: z.number().int().min(1).max(12),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(10000).optional(),
});

export const POST = withRole("super_admin", async (actor, req) => {
  const body = await parseJson(req, createSchema);
  return ok(await createGradeLevel(body, actor), { status: 201 });
});
