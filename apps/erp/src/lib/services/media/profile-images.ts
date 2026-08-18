import {
  deleteReplacedImage,
  isCloudinaryConfigured,
  imageSlot,
  uploadEntityImage,
  validateImageFile,
  ImageValidationError,
  imageFolder,
  type ImageKind,
} from "@repo/server-core/media/images";
import { scopedDb } from "@/lib/db/scope";
import type { SessionUser } from "@/lib/auth/session";
import { BusinessRuleError, ForbiddenError, NotFoundError } from "@/lib/errors/classes";

/**
 * Profile imagery — center logos and teacher photos.
 *
 * Both columns (`centers.logo_url`, `teacher_profiles.photo_url`) already
 * exist; until now they could only be set by PATCHing a URL string, so there
 * was no way to actually upload one. This wires them to the shared Cloudinary
 * kernel with the same discipline the room-photo path uses: ownership
 * re-checked server-side, real magic-byte validation, and a deterministic
 * public_id per entity so replacing an image overwrites it instead of leaking
 * an orphan into the account.
 *
 * Cloudinary's `secure_url` carries a `/v<version>/` segment that changes on
 * every overwrite, so the stored URL self-busts browser caches on replace.
 */

/**
 * The center this session acts for.
 *
 * The target is ALWAYS taken from the session, never from the request, so
 * `requireCenterScope(user, user.centerId)` would only compare the value with
 * itself — a check that reads like isolation while enforcing nothing. What
 * remains genuinely worth asserting is that the session carries a center at
 * all; isolation is enforced by `scopedDb` → RLS binding every query below to
 * that same id.
 */
function ownCenterId(user: SessionUser): string {
  if (!user.centerId) throw new ForbiddenError("Center admin has no center");
  return user.centerId;
}

/** Shared front door: validate, then upload to the entity's deterministic slot. */
async function ingest(
  file: File,
  opts: { kind: ImageKind; entityKey: string; isDemo?: boolean },
): Promise<string> {
  if (!isCloudinaryConfigured()) {
    throw new BusinessRuleError(
      "Image uploads are not configured on this server. Set the CLOUDINARY_* env vars.",
      { reason: "uploads_not_configured" },
    );
  }
  let validated;
  try {
    validated = await validateImageFile(file);
  } catch (err) {
    // Carry the REASON CODE, not just the English sentence — same shape the
    // room-photo path already returns. `message` is for logs; a localized UI
    // translates `details.reason` instead of string-matching English, which is
    // what previously put an English toast on an Arabic screen.
    if (err instanceof ImageValidationError) {
      throw new BusinessRuleError(err.message, { reason: err.reason, ...err.meta });
    }
    throw err;
  }
  const asset = await uploadEntityImage(validated, {
    kind: opts.kind,
    entityKey: opts.entityKey,
    tags: opts.isDemo ? ["edura", "demo"] : ["edura"],
  });
  return asset.secure_url;
}

// ---------------------------------------------------------------------------
// Center logo
// ---------------------------------------------------------------------------

export async function getCenterLogo(user: SessionUser) {
  const centerId = ownCenterId(user);
  const center = await scopedDb(user, (tx) =>
    tx.center.findUnique({ where: { id: centerId }, select: { logoUrl: true } }),
  );
  if (!center) throw new NotFoundError("Center not found");
  return { logoUrl: center.logoUrl };
}

export async function setCenterLogo(file: File, user: SessionUser) {
  const centerId = ownCenterId(user);

  const center = await scopedDb(user, (tx) =>
    tx.center.findUnique({ where: { id: centerId }, select: { logoUrl: true, isDemo: true } }),
  );
  if (!center) throw new NotFoundError("Center not found");

  const url = await ingest(file, {
    kind: "logo",
    entityKey: centerId,
    isDemo: center.isDemo,
  });

  const updated = await scopedDb(user, (tx) =>
    tx.center.update({
      where: { id: centerId },
      data: { logoUrl: url },
      select: { id: true, logoUrl: true },
    }),
  );
  await deleteReplacedImage(center.logoUrl, url, { owned: imageSlot("logo", centerId) });
  return { logoUrl: updated.logoUrl };
}

export async function removeCenterLogo(user: SessionUser) {
  const centerId = ownCenterId(user);

  const center = await scopedDb(user, (tx) =>
    tx.center.findUnique({ where: { id: centerId }, select: { logoUrl: true } }),
  );
  if (!center) throw new NotFoundError("Center not found");

  await scopedDb(user, (tx) =>
    tx.center.update({ where: { id: centerId }, data: { logoUrl: null } }),
  );
  await deleteReplacedImage(center.logoUrl, null, { owned: imageSlot("logo", centerId) });
  return { logoUrl: null };
}

// ---------------------------------------------------------------------------
// Teacher photo
//
// Deliberately NOT delegated to assistants: a teacher's profile photo is
// personal identity, and Step 8's model is default-closed — a route opens to
// delegation only by explicitly switching to the teacher-actor helper.
// ---------------------------------------------------------------------------

export async function setTeacherPhoto(file: File, user: SessionUser) {
  const profile = await scopedDb(user, (tx) =>
    tx.teacherProfile.findUnique({
      where: { userId: user.id },
      select: { id: true, photoUrl: true },
    }),
  );
  if (!profile) throw new NotFoundError("Teacher profile not found");

  const url = await ingest(file, { kind: "avatar", entityKey: user.id });

  const updated = await scopedDb(user, (tx) =>
    tx.teacherProfile.update({
      where: { userId: user.id },
      data: { photoUrl: url },
      select: { photoUrl: true },
    }),
  );
  await deleteReplacedImage(profile.photoUrl, url, { owned: imageSlot("avatar", user.id) });
  return { photoUrl: updated.photoUrl };
}

export async function removeTeacherPhoto(user: SessionUser) {
  const profile = await scopedDb(user, (tx) =>
    tx.teacherProfile.findUnique({ where: { userId: user.id }, select: { photoUrl: true } }),
  );
  if (!profile) throw new NotFoundError("Teacher profile not found");

  await scopedDb(user, (tx) =>
    tx.teacherProfile.update({ where: { userId: user.id }, data: { photoUrl: null } }),
  );
  await deleteReplacedImage(profile.photoUrl, null, { owned: imageSlot("avatar", user.id) });
  return { photoUrl: null };
}

export { imageFolder };
