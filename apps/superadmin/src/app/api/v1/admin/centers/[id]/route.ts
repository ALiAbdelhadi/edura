import { withRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { updateCenterProfile } from "@/lib/services/admin/center-control";
import { getCenter } from "@/lib/services/admin/platform";
import { parseJson } from "@/lib/validation/zod";
import { z } from "zod";

export const dynamic = "force-dynamic";

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
      .refine((u) => u.startsWith("https://res.cloudinary.com/"), "Image must be hosted on Cloudinary")
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
