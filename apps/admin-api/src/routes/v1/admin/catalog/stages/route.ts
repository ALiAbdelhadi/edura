import { z } from "zod";
import { withRole } from "@repo/server-core/backoffice-auth/require-role";
import { ok } from "@repo/server-core/http/envelope";
import { parseJson } from "@repo/server-core/validation/zod";
import { listStages, createStage } from "@repo/server-core/services/catalog/catalog-admin";

export const GET = withRole("super_admin", async (_user, req) => {
  const systemId = new URL(req.url).searchParams.get("systemId") ?? undefined;
  return ok(await listStages(systemId));
});

const createSchema = z.object({
  code: z.string().trim().regex(/^[a-z0-9][a-z0-9-]*$/).max(64),
  educationSystemId: z.string().uuid(),
  nameAr: z.string().trim().min(1).max(200),
  nameEn: z.string().trim().min(1).max(200).optional(),
  hasSecondLanguage: z.boolean().optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(10000).optional(),
});

export const POST = withRole("super_admin", async (actor, req) => {
  const body = await parseJson(req, createSchema);
  return ok(await createStage(body, actor), { status: 201 });
});
