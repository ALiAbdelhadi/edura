import { scopedDb } from "../../db/scope";
import { NotFoundError } from "../../errors/classes";
import type { SessionUser } from "../../auth/types";

export type CenterProfilePatch = {
  name?: string;
  description?: string;
  subjects?: string[];
  address?: string;
  phone?: string;
  whatsapp?: string;
  email?: string;
  governorate?: string | null;
  area?: string | null;
  location?: { type: "Point"; coordinates: [number, number] };
};

export async function getOwnCenter(user: SessionUser) {
  const center = await scopedDb(user, (tx) =>
    tx.center.findUnique({ where: { id: user.centerId as string } }),
  );
  if (!center) throw new NotFoundError("Center not found");
  return center;
}

export async function updateOwnCenter(user: SessionUser, body: CenterProfilePatch) {
  const { location, ...rest } = body;
  const data = location
    ? { ...rest, lng: location.coordinates[0], lat: location.coordinates[1] }
    : rest;

  return scopedDb(user, async (tx) => {
    try {
      return await tx.center.update({ where: { id: user.centerId as string }, data });
    } catch (err) {
      if (err && typeof err === "object" && (err as { code?: string }).code === "P2025") {
        throw new NotFoundError("Center not found");
      }
      throw err;
    }
  });
}
