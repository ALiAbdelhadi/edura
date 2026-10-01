import { withRole } from "@repo/server-core/backoffice-auth/require-role";
import { ok } from "@repo/server-core/http/envelope";
import { createSystem, listSystems } from "@repo/server-core/services/catalog/catalog-admin";
import { parseJson } from "@repo/server-core/validation/zod";
import { z } from "zod";

export const GET = withRole("super_admin", async () => {
  return ok(await listSystems());
});

const createSchema = z.object({
  code: z.string().trim().regex(/^[a-z0-9][a-z0-9-]*$/).max(64),
  nameAr: z.string().trim().min(1).max(200),
  nameEn: z.string().trim().min(1).max(200).optional(),
  iconKey: z.string().trim().max(64).optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(10000).optional(),
});

export const POST = withRole("super_admin", async (actor, req) => {
  const body = await parseJson(req, createSchema);
  return ok(await createSystem(body, actor), { status: 201 });
});
