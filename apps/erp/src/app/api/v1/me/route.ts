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

  // Step 8: assistants get their live acting-teacher (UI hint only; every
  // request re-resolves server-side, so revocation is immediate regardless).
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

  // Center staff get their live preset sub-role, for the same reason and with
  // the same caveat as the assistant's acting teacher above: a UI HINT ONLY.
  // Every route re-resolves it server-side through the same helper, so a
  // soft-removed or re-graded staff member is gated correctly on the next
  // request no matter what the client last cached.
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
    // Step 7: lets the claim flow know credentials still need to be set.
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

  // `users.phone` is globally UNIQUE (it is a dedup key for manually entered
  // students). Without this, correcting a phone to one already on file threw a
  // raw P2002 that surfaced as "A record with these unique values already
  // exists" — true, unactionable, and it names no field. The index is still the
  // authority; this only buys the ordinary collision a sentence.
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

  // A student carries their name TWICE: `users.name` (what this form edits) and
  // `student_profiles.full_name` (what a walk-in counter wrote). Every reader
  // prefers `users.name` and falls back to the profile — except global search,
  // which FILTERS on `full_name` in SQL. So a student who corrected a misspelled
  // name stopped being findable by the corrected spelling at the very counter
  // that has to find them. One edit, both columns, no second source of truth.
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
