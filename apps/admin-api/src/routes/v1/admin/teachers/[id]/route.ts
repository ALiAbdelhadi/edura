import { isPlatformMediaUrl } from "@repo/shared/media-delivery";
import { z } from "zod";
import { withRole } from "@repo/server-core/backoffice-auth/require-role";
import { ok } from "@repo/server-core/http/envelope";
import { parseJson } from "@repo/server-core/validation/zod";
import { emailSchema } from "@repo/server-core/validation/common";
import { teacherOverview } from "@repo/server-core/backoffice/admin/teacher-oversight";
import { updateTeacherProfile } from "@repo/server-core/backoffice/admin/teacher-control";

export const GET = withRole("super_admin", async (_user, _req, ctx) => {
  const { id } = await ctx.params;
  return ok(await teacherOverview(id));
});

// Mirrors the centre profile PATCH: a whitelist, `.strict()` so an unknown key
// is a 422 rather than a silent no-op, and no reach into status, role or
// attendance mode -- each of those has its own audited door.
const patchSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    phone: z.string().trim().max(40).nullable().optional(),
    email: emailSchema.optional(), // DIFF-06: lowercased like create; users.email is case-sensitive unique
    locale: z.enum(["ar", "en"]).optional(),
    bio: z.string().trim().max(2000).nullable().optional(),
    subjects: z.array(z.string().trim().min(1).max(120)).max(40).optional(),
    qualifications: z.string().trim().max(2000).nullable().optional(),
    experienceYears: z.number().int().min(0).max(80).optional(),
    // DIFF-04: lands in a public <img src> / OG tag — only our own CDN.
    photoUrl: z
      .url()
      .max(2000)
      .refine(isPlatformMediaUrl, "Image must be hosted on the platform media storage")
      .nullable()
      .optional(),
    lessonPrice: z.number().int().min(0).max(99_999_900).nullable().optional(),
  })
  .strict();

export const PATCH = withRole("super_admin", async (user, req, ctx) => {
  const { id } = await ctx.params;
  const patch = await parseJson(req, patchSchema);
  return ok(await updateTeacherProfile(id, patch, user));
});
