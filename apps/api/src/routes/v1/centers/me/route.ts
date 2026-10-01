import { z } from "zod";
import { withErrors } from "@repo/server-core/errors/http";
import { requireRole } from "@repo/server-core/authz/require-role";
import { ok } from "@repo/server-core/http/envelope";
import { parseJson } from "@repo/server-core/validation/zod";
import { invalidatesPublicData } from "@repo/server-core/cache/public-data";
import { getOwnCenter, updateOwnCenter } from "@repo/server-core/services/center/center-profile";

export const GET = withErrors(async () => {
  const user = await requireRole("center_admin");
  return ok(await getOwnCenter(user));
});

const patchSchema = z.object({
  name: z.string().trim().min(1).optional(),
  description: z.string().optional(),
  subjects: z.array(z.string()).optional(),
  address: z.string().optional(),
  phone: z.string().optional(),
  whatsapp: z.string().optional(),
  email: z.string().email().optional(),
  governorate: z.string().trim().max(100).nullish(),
  area: z.string().trim().max(100).nullish(),
  location: z
    .object({
      type: z.literal("Point"),
      coordinates: z.tuple([z.number(), z.number()]),
    })
    .optional(),
});

const handlePatch = withErrors(async (req) => {
  const user = await requireRole("center_admin");
  const body = await parseJson(req, patchSchema);
  return ok(await updateOwnCenter(user, body));
});

export const PATCH = invalidatesPublicData(handlePatch);
