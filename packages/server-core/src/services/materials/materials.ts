import { scopedDb } from "../../db/scope";
import type { SessionUser as AuthUser } from "../../auth/types";
import type { TenantTx } from "../../db/scope";
import { resolveMediaDriver } from "../../media/storage";
import { notify } from "../notifications/notify";
import {
  ForbiddenError,
  NotFoundError,
  BusinessRuleError,
} from "../../errors/classes";

const MAX_FILE_SIZE = 10 * 1024 * 1024;

const PDF_MAGIC = Buffer.from("%PDF-", "latin1");

function assertPdfBytes(buffer: Buffer): void {
  const header = buffer.subarray(0, PDF_MAGIC.length);
  if (header.length < PDF_MAGIC.length || !header.equals(PDF_MAGIC)) {
    throw new BusinessRuleError("Only PDF files are accepted");
  }
}

type MaterialType = "lecture" | "homework" | "exam" | "other";

type SessionUser = { id: string; role: string; centerId?: string };

function asAuthUser(user: SessionUser): AuthUser {
  return user as unknown as AuthUser;
}

async function verifyTeacherOwnsCourse(
  tx: TenantTx,
  courseId: string,
  teacherId: string,
) {
  const course = await tx.course.findUnique({ where: { id: courseId } });
  if (!course) throw new NotFoundError("Course not found");
  if (course.teacherId !== teacherId)
    throw new ForbiddenError(
      "Only the assigned teacher can manage materials for this course",
    );
  return course;
}

async function verifyActiveEnrollment(
  tx: TenantTx,
  courseId: string,
  studentId: string,
) {
  const enrollment = await tx.enrollment.findFirst({
    where: { courseId, studentId, status: "active" },
  });
  if (!enrollment)
    throw new ForbiddenError("You are not enrolled in this course");
}

function parseExternalPdfUrl(value: FormDataEntryValue | null): string | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new BusinessRuleError("Material link must be a valid URL");
  }
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new BusinessRuleError("Material link must use http or https");
  }
  return url.toString();
}

export async function uploadMaterial(formData: FormData, user: SessionUser) {
  const courseId = formData.get("courseId") as string;
  const title = formData.get("title") as string;
  const type = formData.get("type") as string;
  const file = formData.get("file") as File | null;
  const externalUrl = parseExternalPdfUrl(formData.get("fileUrl"));

  if (!courseId || !title || !type)
    throw new BusinessRuleError("courseId, title and type are required");
  if (!file && !externalUrl)
    throw new BusinessRuleError("A PDF file or material link is required");

  const course = await scopedDb(asAuthUser(user), (tx) =>
    verifyTeacherOwnsCourse(tx, courseId, user.id),
  );
  if (!course.centerId) {
    throw new BusinessRuleError("Materials are not yet available for teacher-direct courses");
  }
  const materialCenterId = course.centerId;

  const materialInput: {
    storageProvider: "external" | "cloudinary";
    externalUrl?: string | null;
    cloudinaryPublicId?: string | null;
    cloudinaryUrl?: string | null;
    fileSizeBytes?: number | null;
  } = { storageProvider: "external" };
  if (externalUrl) {
    materialInput.storageProvider = "external";
    materialInput.externalUrl = externalUrl;
    materialInput.fileSizeBytes = null;
  } else {
    const uploadFile = file;
    if (!uploadFile) throw new BusinessRuleError("file is required");
    if (!resolveMediaDriver().uploadsEnabled()) {
      throw new BusinessRuleError(
        "File uploads need media storage configured. Configure it or use a PDF link for now.",
      );
    }
    if (uploadFile.type !== "application/pdf")
      throw new BusinessRuleError("Only PDF files are accepted");
    if (uploadFile.size > MAX_FILE_SIZE)
      throw new BusinessRuleError("File size must be 10 MB or less");

    const buffer = Buffer.from(await uploadFile.arrayBuffer());
    assertPdfBytes(buffer); // real bytes must be a PDF, not just the declared type
    // SECURITY_AUDIT.md (2026-09-11) OPS-01: paid material is `authenticated`
    // on Cloudinary — served only through a signed URL minted per download —
    // and no public URL is persisted for it.
    const uploaded = await resolveMediaDriver().upload(buffer, {
      folder: `edura/materials/${courseId}`,
      resource_type: "raw",
      type: "authenticated",
      filename: uploadFile.name || "material.pdf",
    });
    materialInput.storageProvider = "cloudinary";
    materialInput.cloudinaryPublicId = uploaded.public_id;
    materialInput.cloudinaryUrl = null;
    materialInput.fileSizeBytes = uploaded.bytes;
  }

  const { material, studentIds } = await scopedDb(
    asAuthUser(user),
    async (tx) => {
      const created = await tx.material.create({
        data: {
          courseId,
          centerId: materialCenterId,
          teacherId: user.id,
          title,
          type: type as MaterialType,
          ...materialInput,
        },
      });

      const enrollments = await tx.enrollment.findMany({
        where: { courseId, status: "active" },
        select: { studentId: true },
      });
      return {
        material: created,
        studentIds: enrollments.map((e) => e.studentId),
      };
    },
  );

  if (studentIds.length > 0) {
    await notify({
      recipients: studentIds,
      type: "material_uploaded",
      title: "New material uploaded",
      body: `A new material "${title}" has been added to your course.`,
      data: { materialId: material.id, courseId },
    });
  }

  return material;
}

export async function listMaterials(
  courseId: string | undefined,
  user: SessionUser,
) {
  return scopedDb(asAuthUser(user), async (tx) => {
    const where: {
      courseId?: string | { in: string[] };
      centerId?: string;
      teacherId?: string;
    } = {};
    if (courseId) where.courseId = courseId;

    if (user.role === "center_admin") {
      where.centerId = user.centerId;
    } else if (user.role === "teacher") {
      where.teacherId = user.id;
    } else if (user.role === "student") {
      const enrollments = await tx.enrollment.findMany({
        where: { studentId: user.id, status: "active" },
        select: { courseId: true },
      });
      const courseIds = enrollments.map((e) => e.courseId);
      if (courseId) {
        if (!courseIds.includes(courseId)) throw new ForbiddenError();
      } else {
        where.courseId = { in: courseIds };
      }
    } else if (user.role === "parent") {
      const links = await tx.parentStudentLink.findMany({
        where: { parentId: user.id, status: "approved" },
        select: { studentId: true },
      });
      const studentIds = links.map((l) => l.studentId);
      if (studentIds.length === 0)
        throw new ForbiddenError("No linked children");
      const enrollments = await tx.enrollment.findMany({
        where: { studentId: { in: studentIds }, status: "active" },
        select: { courseId: true },
      });
      const courseIds = enrollments.map((e) => e.courseId);
      if (courseId) {
        if (!courseIds.includes(courseId)) throw new ForbiddenError();
      } else {
        where.courseId = { in: courseIds };
      }
    } else {
      throw new ForbiddenError();
    }

    return tx.material.findMany({
      where,
      select: {
        id: true,
        courseId: true,
        centerId: true,
        teacherId: true,
        title: true,
        type: true,
        storageProvider: true,
        fileSizeBytes: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  });
}

export async function getMaterialDownloadUrl(
  materialId: string,
  user: SessionUser,
) {
  const material = await scopedDb(asAuthUser(user), async (tx) => {
    const found = await tx.material.findUnique({ where: { id: materialId } });
    if (!found) throw new NotFoundError("Material not found");

    if (user.role === "student") {
      await verifyActiveEnrollment(tx, found.courseId, user.id);
    } else if (user.role === "parent") {
      const links = await tx.parentStudentLink.findMany({
        where: { parentId: user.id, status: "approved" },
        select: { studentId: true },
      });
      const studentIds = links.map((l) => l.studentId);
      if (studentIds.length === 0)
        throw new ForbiddenError("No linked children");
      const enrollment = await tx.enrollment.findFirst({
        where: {
          courseId: found.courseId,
          studentId: { in: studentIds },
          status: "active",
        },
      });
      if (!enrollment)
        throw new ForbiddenError("No linked child is enrolled in this course");
    } else if (user.role === "center_admin") {
      if (found.centerId !== user.centerId) throw new ForbiddenError();
    } else if (user.role === "teacher") {
      if (found.teacherId !== user.id) throw new ForbiddenError();
    } else {
      throw new ForbiddenError();
    }

    return found;
  });

  if (material.storageProvider === "external") {
    if (!material.externalUrl)
      throw new NotFoundError("Material link not found");
    return { url: material.externalUrl };
  }

  // OPS-01: a persisted `cloudinaryUrl` marks a LEGACY upload (delivery type
  // `upload`, publicly served) — a signed `authenticated` URL would not resolve
  // for it, so it is returned as-is until the asset is migrated
  // (SECURITY_TODO.md). Everything uploaded since is `authenticated` and gets
  // a signed URL per download.
  if (material.cloudinaryUrl) return { url: material.cloudinaryUrl };
  if (!material.cloudinaryPublicId)
    throw new NotFoundError("Material file not found");

  return { url: resolveMediaDriver().signedUrl(material.cloudinaryPublicId) };
}

export async function updateMaterial(
  materialId: string,
  formData: FormData,
  user: SessionUser,
) {
  const material = await scopedDb(asAuthUser(user), async (tx) => {
    const found = await tx.material.findUnique({ where: { id: materialId } });
    if (!found) throw new NotFoundError("Material not found");
    if (found.teacherId !== user.id) throw new ForbiddenError();
    return found;
  });

  const title = formData.get("title") as string | null;
  const type = formData.get("type") as string | null;
  const file = formData.get("file") as File | null;
  const externalUrl = parseExternalPdfUrl(formData.get("fileUrl"));

  const data: {
    title?: string;
    type?: MaterialType;
    storageProvider?: "external" | "cloudinary";
    externalUrl?: string | null;
    cloudinaryPublicId?: string | null;
    cloudinaryUrl?: string | null;
    fileSizeBytes?: number | null;
  } = {};
  if (title) data.title = title;
  if (type) data.type = type as MaterialType;

  if (externalUrl) {
    if (material.cloudinaryPublicId) {
      await resolveMediaDriver().destroy(material.cloudinaryPublicId).catch(() => {});
    }
    data.storageProvider = "external";
    data.externalUrl = externalUrl;
    data.cloudinaryPublicId = null;
    data.cloudinaryUrl = null;
    data.fileSizeBytes = null;
  } else if (file) {
    if (!resolveMediaDriver().uploadsEnabled()) {
      throw new BusinessRuleError(
        "File uploads need media storage configured. Configure it or use a PDF link for now.",
      );
    }
    if (file.type !== "application/pdf")
      throw new BusinessRuleError("Only PDF files are accepted");
    if (file.size > MAX_FILE_SIZE)
      throw new BusinessRuleError("File size must be 10 MB or less");

    const buffer = Buffer.from(await file.arrayBuffer());
    assertPdfBytes(buffer);

    if (material.cloudinaryPublicId) {
      await resolveMediaDriver().destroy(material.cloudinaryPublicId).catch(() => {});
    }

    const uploaded = await resolveMediaDriver().upload(buffer, {
      folder: `edura/materials/${material.courseId}`,
      resource_type: "raw",
      type: "authenticated", // OPS-01, as in createMaterial
      filename: file.name || "material.pdf",
    });
    data.storageProvider = "cloudinary";
    data.cloudinaryPublicId = uploaded.public_id;
    data.cloudinaryUrl = null;
    data.externalUrl = null;
    data.fileSizeBytes = uploaded.bytes;
  }

  return scopedDb(asAuthUser(user), (tx) =>
    tx.material.update({ where: { id: materialId }, data }),
  );
}

export async function deleteMaterial(materialId: string, user: SessionUser) {
  const material = await scopedDb(asAuthUser(user), async (tx) => {
    const found = await tx.material.findUnique({ where: { id: materialId } });
    if (!found) throw new NotFoundError("Material not found");
    if (found.teacherId !== user.id) throw new ForbiddenError();
    return found;
  });

  if (material.cloudinaryPublicId) {
    await resolveMediaDriver().destroy(material.cloudinaryPublicId).catch(() => {});
  }
  await scopedDb(asAuthUser(user), (tx) =>
    tx.material.delete({ where: { id: materialId } }),
  );
  return { deleted: true };
}
