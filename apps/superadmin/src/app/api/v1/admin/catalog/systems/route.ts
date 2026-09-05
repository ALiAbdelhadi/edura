import { withRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { createSystem, listSystems } from "@/lib/services/catalog/catalog-admin";
import { parseJson } from "@/lib/validation/zod";
import { z } from "zod";

export const dynamic = "force-dynamic";

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
