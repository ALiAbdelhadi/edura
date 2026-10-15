import {
  deleteReplacedImage,
  imageSlot,
  uploadEntityImage,
  validateImageFile,
  ImageValidationError,
  imageFolder,
  type ImageKind,
} from "../../media/images";
import { resolveMediaDriver } from "../../media/storage";
import { scopedDb } from "../../db/scope";
import type { SessionUser } from "../../auth/types";
import { BusinessRuleError, ForbiddenError, NotFoundError } from "../../errors/classes";

function ownCenterId(user: SessionUser): string {
  if (!user.centerId) throw new ForbiddenError("Center admin has no center");
  return user.centerId;
}

async function ingest(
  file: File,
  opts: { kind: ImageKind; entityKey: string; isDemo?: boolean },
): Promise<string> {
  if (!resolveMediaDriver().uploadsEnabled()) {
    throw new BusinessRuleError(
      "Image uploads are not configured on this server. Set the CLOUDINARY_* env vars.",
      { reason: "uploads_not_configured" },
    );
  }
  let validated;
  try {
    validated = await validateImageFile(file);
  } catch (err) {
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
