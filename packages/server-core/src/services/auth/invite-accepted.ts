import { platformDb } from "../../db/scope";

export type AcceptedInviteUser = {
  user: {
    id: string;
    email: string;
    role: string;
    status: string;
    name: string;
    locale: string;
  };
  affiliationId?: string;
};

export async function loadAcceptedInviteUser(userId: string): Promise<AcceptedInviteUser> {
  const { user, affiliationId } = await platformDb(async (tx) => {
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { email: true, role: true, status: true, name: true, locale: true },
    });

    let affiliationId: string | undefined;
    if (user?.role === "teacher") {
      const aff = await tx.centerTeacherAffiliation.findFirst({
        where: { teacherId: userId, status: "pending" },
        select: { id: true },
      });
      affiliationId = aff?.id;
    }
    return { user, affiliationId };
  });

  return {
    user: {
      id: userId,
      email: user?.email ?? "",
      role: user?.role ?? "",
      status: user?.status ?? "active",
      name: user?.name ?? "",
      locale: user?.locale ?? "ar",
    },
    ...(affiliationId ? { affiliationId } : {}),
  };
}
