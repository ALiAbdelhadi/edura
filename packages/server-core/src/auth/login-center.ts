import { withPlatformContext } from "@repo/database";

// Kept apart from login-policy.ts on purpose: that module is imported by the
// client-side login page (through lib/auth/portal.ts), and one runtime import of
// the database client there pulls pg/fs/net into the browser bundle and fails
// the build.
export async function resolveLoginCenterId(
  role: string,
  userId: string,
): Promise<string | undefined> {
  if (role === "center_admin") {
    const profile = await withPlatformContext((tx) =>
      tx.centerAdminProfile.findFirst({
        where: { userId },
        select: { centerId: true },
      }),
    );
    return profile?.centerId ?? undefined;
  }
  if (role === "center_staff") {
    const link = await withPlatformContext((tx) =>
      tx.centerStaff.findFirst({
        where: { staffUserId: userId, removedAt: null },
        select: { centerId: true },
      }),
    );
    return link?.centerId ?? undefined;
  }
  return undefined;
}
