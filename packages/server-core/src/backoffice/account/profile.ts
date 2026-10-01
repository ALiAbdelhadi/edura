import type { SessionUser } from "../../auth/types";
import { scopedDb } from "../../db/scope";
import { NotFoundError } from "../../errors/classes";

export async function getOwnProfile(session: SessionUser) {
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
      },
    }),
  );
  if (!user) throw new NotFoundError("User not found");

  return {
    id: session.id,
    email: user.email,
    role: user.role,
    status: user.status,
    name: user.name,
    locale: user.locale,
    phone: user.phone ?? null,
    emailVerified: !!user.emailVerified,
    centerId: session.centerId ?? null,
  };
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
