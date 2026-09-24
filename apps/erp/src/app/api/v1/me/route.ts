import { z } from "zod";
import { withErrors } from "@/lib/errors/http";
import { requireSession } from "@/lib/auth/session";
import { resolveActingTeacher } from "@/lib/authz/teacher-actor";
import { resolveCenterActorContext } from "@/lib/authz/center-actor";
import { platformDb, scopedDb } from "@/lib/db/scope";
import { ConflictError, NotFoundError } from "@/lib/errors/classes";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { phoneSchema } from "@/lib/validation/common";
import { invalidatesPublicData } from "@/lib/cache/public-data";

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

  let actingTeacher: { id: string; name: string | null } | null = null;
  if (session.role === "assistant") {
    try {
      const teacherId = await scopedDb(session, (tx) => resolveActingTeacher(tx, session));
      const t = await scopedDb(session, (tx) =>
        tx.user.findUnique({ where: { id: teacherId }, select: { name: true } }),
      );
      actingTeacher = { id: teacherId, name: t?.name ?? null };
    } catch {
      actingTeacher = null; // unlinked assistant
    }
  }

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

  const updates: Record<string, unknown> = {};
  if (body.name !== undefined) updates.name = body.name.trim();
  if (body.phone !== undefined) updates.phone = body.phone || null;
  if (body.locale !== undefined) updates.locale = body.locale;

  if (Object.keys(updates).length === 0) {
    return ok({ updated: false });
  }

  if (typeof updates.phone === "string") {
    const taken = await platformDb((tx) =>
      tx.user.findFirst({
        where: { phone: updates.phone as string, id: { not: session.id } },
        select: { id: true },
      }),
    );
    if (taken) throw new ConflictError("This phone number is already in use");
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

  if (session.role === "student" && typeof updates.name === "string") {
    await platformDb(
      (tx) =>
        tx.studentProfile.updateMany({
          where: { userId: session.id },
          data: { fullName: updates.name as string },
        }),
      { actorId: session.id },
    );
  }

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

export const PATCH = invalidatesPublicData(handlePatch);
