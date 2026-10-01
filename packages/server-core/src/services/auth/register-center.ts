import { platformDb } from "../../db/scope";

export function setCenterLocation(
  centerId: string,
  location: { lat: number; lng: number },
): Promise<unknown> {
  const { lat, lng } = location;
  return platformDb((tx) => tx.center.update({ where: { id: centerId }, data: { lat, lng } }));
}

export function loadRegisteredCenterAdmin(userId: string) {
  return platformDb((tx) =>
    tx.user.findUnique({
      where: { id: userId },
      select: { email: true, role: true, status: true, name: true },
    }),
  );
}
