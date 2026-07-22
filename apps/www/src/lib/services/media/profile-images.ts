import {
  deleteImageByUrl,
  isCloudinaryConfigured,
  publicIdFromUrl,
  uploadEntityImage,
  validateImageFile,
  ImageValidationError,
  imageFolder,
  type ImageKind,
} from "@repo/server-core/media/images";
import { scopedDb } from "@/lib/db/scope";
import type { SessionUser } from "@/lib/auth/session";
import { requireCenterScope } from "@/lib/authz/require-center-scope";
import { BusinessRuleError, NotFoundError, ValidationError } from "@/lib/errors/classes";

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

/** Shared front door: validate, then upload to the entity's deterministic slot. */
async function ingest(
  file: File,
  opts: { kind: ImageKind; entityKey: string; isDemo?: boolean },
): Promise<string> {
  if (!isCloudinaryConfigured()) {
    throw new BusinessRuleError(
      "Image uploads are not configured on this server. Set the CLOUDINARY_* env vars.",
    );
  }
  let validated;
  try {
    validated = await validateImageFile(file);
  } catch (err) {
    if (err instanceof ImageValidationError) throw new ValidationError(err.message);
    throw err;
  }
  const asset = await uploadEntityImage(validated, {
    kind: opts.kind,
    entityKey: opts.entityKey,
    tags: opts.isDemo ? ["edura", "demo"] : ["edura"],
  });
  return asset.secure_url;
}

/**
 * Delete the previously stored asset, but only when the new upload did not
 * already overwrite it (same public_id) and it is actually ours.
 */
async function cleanupPrevious(previousUrl: string | null, newUrl: string | null) {
  if (!previousUrl || previousUrl === newUrl) return;
  const previousId = publicIdFromUrl(previousUrl);
  const newId = newUrl ? publicIdFromUrl(newUrl) : null;
  if (previousId && previousId === newId) return; // overwritten in place
  await deleteImageByUrl(previousUrl);
}

// ---------------------------------------------------------------------------
// Center logo
// ---------------------------------------------------------------------------

export async function setCenterLogo(file: File, user: SessionUser) {
  const centerId = user.centerId as string;
  requireCenterScope(user, centerId);

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
  await cleanupPrevious(center.logoUrl, url);
  return { logoUrl: updated.logoUrl };
}

export async function removeCenterLogo(user: SessionUser) {
  const centerId = user.centerId as string;
  requireCenterScope(user, centerId);

  const center = await scopedDb(user, (tx) =>
    tx.center.findUnique({ where: { id: centerId }, select: { logoUrl: true } }),
  );
  if (!center) throw new NotFoundError("Center not found");

  await scopedDb(user, (tx) =>
    tx.center.update({ where: { id: centerId }, data: { logoUrl: null } }),
  );
  await cleanupPrevious(center.logoUrl, null);
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
  await cleanupPrevious(profile.photoUrl, url);
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
  await cleanupPrevious(profile.photoUrl, null);
  return { photoUrl: null };
}

export { imageFolder };
