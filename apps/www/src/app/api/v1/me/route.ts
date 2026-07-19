import { z } from "zod";
import { withErrors } from "@/lib/errors/http";
import { requireSession } from "@/lib/auth/session";
import { scopedDb } from "@/lib/db/scope";
import { NotFoundError } from "@/lib/errors/classes";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { phoneSchema } from "@/lib/validation/common";

export const dynamic = "force-dynamic";

export const GET = withErrors(async () => {
  const session = await requireSession();
  const user = await scopedDb(session, (tx) =>
    tx.user.findUnique({
      where: { id: session.id },
      select: {
        email: true,
        role: true,
        status: true,
        name: true,
        locale: true,
        phone: true,
        emailVerified: true,
        passwordHash: true,
      },
    }),
  );
  if (!user) throw new NotFoundError("User not found");

  return ok({
    id: session.id,
    email: user.email,
    role: user.role,
    status: user.status,
    name: user.name,
    locale: user.locale,
    phone: user.phone ?? null,
    emailVerified: !!user.emailVerified,
    // Step 7: lets the claim flow know credentials still need to be set.
    hasPassword: !!user.passwordHash,
    centerId: session.centerId ?? null,
  });
});

const patchSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  phone: phoneSchema.optional(),
  locale: z.enum(["ar", "en"]).optional(),
});

export const PATCH = withErrors(async (req) => {
  const session = await requireSession();
  const body = await parseJson(req, patchSchema);

  const updates: Record<string, unknown> = {};
  if (body.name !== undefined) updates.name = body.name.trim();
  if (body.phone !== undefined) updates.phone = body.phone || null;
  if (body.locale !== undefined) updates.locale = body.locale;

  if (Object.keys(updates).length === 0) {
    return ok({ updated: false });
  }

  const user = await scopedDb(session, (tx) =>
    tx.user.update({
      where: { id: session.id },
      data: updates,
      select: {
        email: true,
        role: true,
        status: true,
        name: true,
        locale: true,
        phone: true,
      },
    }),
  );

  if (!user) throw new NotFoundError("User not found");

  return ok({
    updated: true,
    user: {
      id: session.id,
      email: user.email,
      role: user.role,
      name: user.name,
      locale: user.locale,
      phone: user.phone ?? null,
    },
  });
});
