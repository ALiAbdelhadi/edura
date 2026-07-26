import { z } from "zod";
import { scopedDb } from "@/lib/db/scope";
import type { SessionUser } from "@/lib/auth/session";
import { requireCenterScope } from "@/lib/authz/require-center-scope";
import { uploadBuffer, isCloudinaryConfigured } from "@/lib/cloudinary/cloudinary";
import { validateImageFile, ImageValidationError } from "@repo/server-core/media/images";
import { NotFoundError, BusinessRuleError } from "@/lib/errors/classes";

const MAX_PHOTO_SIZE = 5 * 1024 * 1024; // 5 MB
const MAX_PHOTOS_PER_ROOM = 12;

// ---------------------------------------------------------------------------
// Room pricing methods — center-set AVAILABILITY only. Every number behind a
// method (split %, per-student rate) stays superadmin config.
// ---------------------------------------------------------------------------

export const pricingMethodsSchema = z
  .array(z.enum(["whole_room_percent", "per_attending_student"]))
  .min(1)
  .max(2)
  .refine((m) => new Set(m).size === m.length, "Duplicate pricing method");

export const roomCreateSchema = z.object({
  name: z.string().trim().min(1),
  capacity: z.number().int().positive().optional(),
  facilities: z.array(z.string().trim().min(1)).max(30).optional(),
  photos: z.array(z.string().url()).max(12).optional(),
  price: z.number().int().nonnegative().nullable().optional(), // piasters
  description: z.string().trim().max(2000).nullable().optional(),
  allowedPricingMethods: pricingMethodsSchema.optional(),
});

export const roomPatchSchema = z.object({
  name: z.string().trim().min(1).optional(),
  capacity: z.number().int().positive().nullable().optional(),
  facilities: z.array(z.string().trim().min(1)).max(30).optional(),
  photos: z.array(z.string().url()).max(12).optional(), // replace set (e.g. remove a photo)
  price: z.number().int().nonnegative().nullable().optional(), // piasters
  description: z.string().trim().max(2000).nullable().optional(),
  allowedPricingMethods: pricingMethodsSchema.optional(),
});

// Lives in the shared kernel (the collaboration service moved there and needs
// it); re-exported here so every existing www import path keeps working.
export { assertMethod2Enablable } from "@repo/server-core/services/rooms/method2";

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
    );
  }

  let validated;
  try {
    validated = await validateImageFile(file, { maxBytes: MAX_PHOTO_SIZE });
  } catch (err) {
    if (err instanceof ImageValidationError) throw new BusinessRuleError(err.message);
    throw err;
  }
  const { buffer, mime: contentType, extension: ext } = validated;

  return scopedDb(user, async (tx) => {
    const room = await tx.room.findUnique({ where: { id: roomId } });
    if (!room || !room.isActive) throw new NotFoundError("Room not found");
    requireCenterScope(user, room.centerId);
    if (room.photos.length >= MAX_PHOTOS_PER_ROOM) {
      throw new BusinessRuleError(`A room can have at most ${MAX_PHOTOS_PER_ROOM} photos`);
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

    const updated = await tx.room.update({
      where: { id: roomId },
      data: { photos: { push: secure_url } },
    });
    return { url: secure_url, photos: updated.photos };
  });
}
