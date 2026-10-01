import { z } from "zod";
import { withErrors } from "@repo/server-core/errors/http";
import { requireSession } from "@repo/server-core/erp-auth/session";
import { resolveCenterActorContext } from "@repo/server-core/authz/center-actor";
import { ok } from "@repo/server-core/http/envelope";
import { parseJson } from "@repo/server-core/validation/zod";
import { phoneSchema } from "@repo/server-core/validation/common";
import { invalidatesPublicData } from "@repo/server-core/cache/public-data";
import { getOwnProfile, updateOwnProfile } from "@repo/server-core/services/account/profile";

export const GET = withErrors(async () => {
  const session = await requireSession();
  const { user, actingTeacher } = await getOwnProfile(session);

  let staffRole: string | null = null;
  if (session.role === "center_staff") {
    try {
      staffRole = (await resolveCenterActorContext(session)).staffRole;
    } catch {
      staffRole = null; // unlinked staff member
    }
  }

  return ok({
    id: session.id,
    staffRole,
    email: user.email,
    role: user.role,
    status: user.status,
    name: user.name,
    locale: user.locale,
    phone: user.phone ?? null,
    emailVerified: !!user.emailVerified,
    hasPassword: !!user.passwordHash,
    actingTeacherId: actingTeacher?.id ?? null,
    actingTeacherName: actingTeacher?.name ?? null,
    centerId: session.centerId ?? null,
  });
});

const patchSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  phone: phoneSchema.optional(),
  locale: z.enum(["ar", "en"]).optional(),
});

const handlePatch = withErrors(async (req) => {
  const session = await requireSession();
  const body = await parseJson(req, patchSchema);
  return ok(await updateOwnProfile(session, body));
});

export const PATCH = invalidatesPublicData(handlePatch);
