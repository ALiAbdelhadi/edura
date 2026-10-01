import type { SessionUser } from "../../auth/types";
import { resolveActingTeacher } from "../../authz/acting-teacher";
import { platformDb, scopedDb } from "../../db/scope";
import { ConflictError, NotFoundError } from "../../errors/classes";

export async function getOwnProfile(session: SessionUser) {
  const { user, actingTeacher } = await scopedDb(session, async (tx) => {
    const user = await tx.user.findUnique({
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
    });
    let actingTeacher: { id: string; name: string | null } | null = null;
    if (user && session.role === "assistant") {
      try {
        const teacherId = await resolveActingTeacher(tx, session);
        const t = await tx.user.findUnique({ where: { id: teacherId }, select: { name: true } });
        actingTeacher = { id: teacherId, name: t?.name ?? null };
      } catch {
        actingTeacher = null; // unlinked assistant
      }
    }
    return { user, actingTeacher };
  });
  if (!user) throw new NotFoundError("User not found");
  return { user, actingTeacher };
}

export type ProfilePatch = {
  name?: string;
  phone?: string;
  locale?: "ar" | "en";
};

export async function updateOwnProfile(session: SessionUser, body: ProfilePatch) {
  const updates: Record<string, unknown> = {};
  if (body.name !== undefined) updates.name = body.name.trim();
  if (body.phone !== undefined) updates.phone = body.phone || null;
  if (body.locale !== undefined) updates.locale = body.locale;

  if (Object.keys(updates).length === 0) {
    return { updated: false as const };
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

  return {
    updated: true as const,
    user: {
      id: session.id,
      email: user.email,
      role: user.role,
      name: user.name,
      locale: user.locale,
      phone: user.phone ?? null,
    },
  };
}
