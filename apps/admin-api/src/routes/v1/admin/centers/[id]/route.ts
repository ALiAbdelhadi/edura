import { withRole } from "@repo/server-core/backoffice-auth/require-role";
import { ok } from "@repo/server-core/http/envelope";
import { updateCenterProfile } from "@repo/server-core/backoffice/admin/center-control";
import { getCenter } from "@repo/server-core/backoffice/admin/platform";
import { parseJson } from "@repo/server-core/validation/zod";
import { isPlatformMediaUrl } from "@repo/shared/media-delivery";
import { z } from "zod";

export const GET = withRole("super_admin", async (_user, _req, ctx) => {
  const { id } = await ctx.params;
  return ok(await getCenter(id));
});

const patchSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().max(2000).nullable().optional(),
    address: z.string().trim().max(500).nullable().optional(),
    area: z.string().trim().max(200).nullable().optional(),
    governorate: z.string().trim().max(200).nullable().optional(),
    phone: z.string().trim().max(40).nullable().optional(),
    whatsapp: z.string().trim().max(40).nullable().optional(),
    email: z.email().max(320).nullable().optional(),
    // DIFF-04: lands in a public <img src> / OG tag — only our own CDN.
    logoUrl: z
      .url()
      .max(2000)
      .refine(isPlatformMediaUrl, "Image must be hosted on the platform media storage")
      .nullable()
      .optional(),
    classroomCount: z.number().int().min(0).max(1000).optional(),
  })
  .strict();

export const PATCH = withRole("super_admin", async (user, req, ctx) => {
  const { id } = await ctx.params;
  const patch = await parseJson(req, patchSchema);
  return ok(await updateCenterProfile(id, patch, user));
});
