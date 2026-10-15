import { z } from "zod";
import { scopedDb } from "../../db/scope";
import type { SessionUser } from "../../auth/types";
import { requireCenterScope } from "../../authz/center-scope";
import { resolveMediaDriver } from "../../media/storage";
import {
  validateImageFile,
  ImageValidationError,
  deleteImageByUrl,
  MAX_IMAGE_BYTES,
} from "../../media/images";
import { NotFoundError, BusinessRuleError } from "../../errors/classes";
import type { M2RateInput } from "./room-rate";

const MAX_PHOTO_SIZE = MAX_IMAGE_BYTES;
const MAX_PHOTOS_PER_ROOM = 12;

const roomPhotoFolder = (roomId: string) => `edura/rooms/${roomId}`;

export const pricingMethodsSchema = z
  .array(z.enum(["whole_room_percent", "per_attending_student"]))
  .min(1)
  .max(2)
  .refine((m) => new Set(m).size === m.length, "Duplicate pricing method");

export const perStudentRateSchema = z
  .object({
    fee: z.number().int().nonnegative().max(99_999_900).nullable(),
    bp: z.number().int().min(0).max(10_000).nullable(),
  })
  .nullable();

export const roomCreateSchema = z.object({
  name: z.string().trim().min(1),
  capacity: z.number().int().positive().optional(),
  facilities: z.array(z.string().trim().min(1)).max(30).optional(),
  photos: z.array(z.string().url()).max(12).optional(),
  price: z.number().int().nonnegative().nullable().optional(), // piasters
  description: z.string().trim().max(2000).nullable().optional(),
  allowedPricingMethods: pricingMethodsSchema.optional(),
  perStudentRate: perStudentRateSchema.optional(),
});

export const roomPatchSchema = z.object({
  name: z.string().trim().min(1).optional(),
  capacity: z.number().int().positive().nullable().optional(),
  facilities: z.array(z.string().trim().min(1)).max(30).optional(),
  photos: z.array(z.string().url()).max(12).optional(), // replace set (e.g. remove a photo)
  price: z.number().int().nonnegative().nullable().optional(), // piasters
  description: z.string().trim().max(2000).nullable().optional(),
  allowedPricingMethods: pricingMethodsSchema.optional(),
  perStudentRate: perStudentRateSchema.optional(),
});

export function splitRoomPayload<T extends { perStudentRate?: M2RateInput | null }>(body: T) {
  const { perStudentRate, ...roomFields } = body;
  return { roomFields, perStudentRate };
}

export { assertMethod2Enablable } from "./method2";
export {
  setRoomM2RateAsCenter,
  clearRoomM2RateAsCenter,
  resolveRoomRateCeiling,
} from "./room-rate";

export async function uploadRoomPhoto(roomId: string, file: File, user: SessionUser) {
  if (!resolveMediaDriver().uploadsEnabled()) {
    throw new BusinessRuleError(
      "Image uploads are not configured on this server. Add a photo URL instead, or set CLOUDINARY_* env vars.",
      { reason: "uploads_not_configured" },
    );
  }

  let validated;
  try {
    validated = await validateImageFile(file, { maxBytes: MAX_PHOTO_SIZE });
  } catch (err) {
    if (err instanceof ImageValidationError) {
      throw new BusinessRuleError(err.message, { reason: err.reason, ...err.meta });
    }
    throw err;
  }
  const { buffer, mime: contentType, extension: ext } = validated;

  const room = await scopedDb(user, (tx) =>
    tx.room.findUnique({
      where: { id: roomId },
      select: { centerId: true, isActive: true, photos: true },
    }),
  );
  if (!room || !room.isActive) throw new NotFoundError("Room not found");
  requireCenterScope(user, room.centerId);
  if (room.photos.length >= MAX_PHOTOS_PER_ROOM) {
    throw new BusinessRuleError(`A room can have at most ${MAX_PHOTOS_PER_ROOM} photos`, {
      reason: "too_many_photos",
      max: MAX_PHOTOS_PER_ROOM,
    });
  }

  const { secure_url } = await resolveMediaDriver().upload(buffer, {
    folder: roomPhotoFolder(roomId),
    resource_type: "image",
    contentType,
    filename: `room.${ext}`,
    fit: { maxWidth: 2048, maxHeight: 2048, quality: "good" },
    tags: ["edura", "room"],
  });

  let updated;
  try {
    updated = await scopedDb(user, async (tx) => {
      const current = await tx.room.findUnique({
        where: { id: roomId },
        select: { centerId: true, isActive: true, photos: true },
      });
      if (!current || !current.isActive) throw new NotFoundError("Room not found");
      requireCenterScope(user, current.centerId);
      if (current.photos.length >= MAX_PHOTOS_PER_ROOM) {
        throw new BusinessRuleError(`A room can have at most ${MAX_PHOTOS_PER_ROOM} photos`, {
          reason: "too_many_photos",
          max: MAX_PHOTOS_PER_ROOM,
        });
      }
      return tx.room.update({
        where: { id: roomId },
        data: { photos: { push: secure_url } },
        select: { photos: true },
      });
    });
  } catch (err) {
    await deleteImageByUrl(secure_url, { owned: roomPhotoFolder(roomId) + "/" });
    throw err;
  }
  return { url: secure_url, photos: updated.photos };
}

export async function pruneRemovedRoomPhotos(
  roomId: string,
  previous: string[],
  next: string[],
): Promise<void> {
  const kept = new Set(next);
  const removed = previous.filter((url) => !kept.has(url));
  const owned = roomPhotoFolder(roomId) + "/";
  await Promise.all(removed.map((url) => deleteImageByUrl(url, { owned })));
}
