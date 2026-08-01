import { z } from "zod";
import { scopedDb } from "@/lib/db/scope";
import type { SessionUser } from "@/lib/auth/session";
import { requireCenterScope } from "@/lib/authz/require-center-scope";
import { uploadBuffer, isCloudinaryConfigured } from "@/lib/cloudinary/cloudinary";
import {
  validateImageFile,
  ImageValidationError,
  deleteImageByUrl,
} from "@repo/server-core/media/images";
import { NotFoundError, BusinessRuleError } from "@/lib/errors/classes";
import type { M2RateInput } from "@repo/server-core/services/rooms/room-rate";

const MAX_PHOTO_SIZE = 5 * 1024 * 1024; // 5 MB
const MAX_PHOTOS_PER_ROOM = 12;

// ---------------------------------------------------------------------------
// Room pricing methods — the center sets WHICH methods a hall offers, and (as
// the hall's owner) its own per-student rate, BOUNDED by the platform's
// published rate. The whole-room split % stays superadmin-only: that one is
// the platform's cut, not the hall's.
// ---------------------------------------------------------------------------

export const pricingMethodsSchema = z
  .array(z.enum(["whole_room_percent", "per_attending_student"]))
  .min(1)
  .max(2)
  .refine((m) => new Set(m).size === m.length, "Duplicate pricing method");

/**
 * The hall's own per-student rate.
 *  - omitted  → leave whatever the hall has (inherit, or keep its override)
 *  - null     → drop the override, go back to inheriting the platform's rate
 *  - object   → set it (server re-checks shape + ceiling; the UI is a hint)
 */
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

/**
 * `perStudentRate` is NOT a Room column — it is a commission_settings scope row
 * written alongside. Split it out so the rest can still be spread straight into
 * the Prisma call and a new field can never leak into `room.create` by accident.
 */
export function splitRoomPayload<T extends { perStudentRate?: M2RateInput | null }>(body: T) {
  const { perStudentRate, ...roomFields } = body;
  return { roomFields, perStudentRate };
}

// Lives in the shared kernel (the collaboration service moved there and needs
// it); re-exported here so every existing www import path keeps working.
export { assertMethod2Enablable } from "@repo/server-core/services/rooms/method2";
export {
  setRoomM2RateAsCenter,
  clearRoomM2RateAsCenter,
  resolveRoomRateCeiling,
} from "@repo/server-core/services/rooms/room-rate";

/**
 * Upload a room photo to Cloudinary and append its URL to room.photos.
 * center_admin only, own center (ownership re-checked here). Reuses the exact
 * signed server-side upload the materials flow uses.
 *
 * Validation (size + M6 magic-byte sniffing — `file.type` is attacker-
 * controlled, so an HTML/SVG/script payload spoofed as image/jpeg must not be
 * served from the Cloudinary domain) lives in @repo/server-core/media/images
 * so every image surface enforces it identically.
 */
export async function uploadRoomPhoto(roomId: string, file: File, user: SessionUser) {
  if (!isCloudinaryConfigured()) {
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

  // Authorize and check the cap first, so a rejected upload never reaches
  // Cloudinary.
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

  const { secure_url } = await uploadBuffer(buffer, {
    folder: `edura/rooms/${roomId}`,
    resource_type: "image",
    contentType,
    filename: `room.${ext}`,
    // Cap what we store: a 12 MP phone photo is pointless as a hall picture,
    // and every cold-cache fetch pays for the extra pixels. Delivery-time
    // resizing still happens per-surface via @repo/ui/lib/cloudinary.
    transformation: "c_limit,w_2048,h_2048,q_auto:good",
    tags: ["edura", "room"],
  });

  // The checks above ran before a multi-second network round-trip, so re-run
  // the ones that could have changed while it was in flight.
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
    // Nothing points at the asset now, and its public_id is random, so it would
    // be unreachable forever. Drop it rather than leak it into the account.
    await deleteImageByUrl(secure_url);
    throw err;
  }
  return { url: secure_url, photos: updated.photos };
}

/**
 * Drop the Cloudinary assets a photo-list edit removed.
 *
 * Room photos get a RANDOM public_id (unlike avatars/logos, a room holds many),
 * so a URL dropped from `room.photos` is the last reference that existed — the
 * asset would otherwise sit in the account forever, unreachable.
 *
 * Runs AFTER the row is committed and never throws: deleting first would leave
 * the room pointing at a dead URL if the write then failed, and a Cloudinary
 * hiccup must not fail an edit the user already saw succeed. Non-Cloudinary
 * entries (externally hosted URLs) are ignored by `deleteImageByUrl`.
 */
export async function pruneRemovedRoomPhotos(previous: string[], next: string[]): Promise<void> {
  const kept = new Set(next);
  const removed = previous.filter((url) => !kept.has(url));
  await Promise.all(removed.map((url) => deleteImageByUrl(url)));
}
