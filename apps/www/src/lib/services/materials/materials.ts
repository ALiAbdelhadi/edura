import { scopedDb } from "@/lib/db/scope";
import type { SessionUser as AuthUser } from "@/lib/auth/session";
import type { TenantTx } from "@/lib/db/scope";
import {
  uploadBuffer,
  generateSignedUrl,
  deleteResource,
  isCloudinaryConfigured,
} from "@/lib/cloudinary/cloudinary";
import { notify } from "@/lib/services/notifications/notify";
import {
  ForbiddenError,
  NotFoundError,
  BusinessRuleError,
} from "@/lib/errors/classes";

const MAX_FILE_SIZE = 10 * 1024 * 1024;

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
    // materials.center_id stays NOT NULL in Step 4 — materials for
    // teacher-direct courses are deliberately deferred (tracked for 4.5+).
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
    if (!isCloudinaryConfigured()) {
      throw new BusinessRuleError(
        "File uploads need Cloudinary storage configured. Add Cloudinary env vars or use a PDF link for now.",
      );
    }
    if (uploadFile.type !== "application/pdf")
      throw new BusinessRuleError("Only PDF files are accepted");
    if (uploadFile.size > MAX_FILE_SIZE)
      throw new BusinessRuleError("File size must be 10 MB or less");

    const buffer = Buffer.from(await uploadFile.arrayBuffer());
    const uploaded = await uploadBuffer(buffer, {
      folder: `edura/materials/${courseId}`,
      resource_type: "raw",
      filename: uploadFile.name || "material.pdf",
    });
    materialInput.storageProvider = "cloudinary";
    materialInput.cloudinaryPublicId = uploaded.public_id;
    materialInput.cloudinaryUrl = uploaded.secure_url;
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
    }

    return tx.material.findMany({ where });
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
    }

    return found;
  });

  if (material.storageProvider === "external") {
    if (!material.externalUrl)
      throw new NotFoundError("Material link not found");
    return { url: material.externalUrl };
  }

  if (material.cloudinaryUrl) return { url: material.cloudinaryUrl };
  if (!material.cloudinaryPublicId)
    throw new NotFoundError("Material file not found");

  const url = await generateSignedUrl(material.cloudinaryPublicId);
  return { url };
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
      await deleteResource(material.cloudinaryPublicId).catch(() => {});
    }
    data.storageProvider = "external";
    data.externalUrl = externalUrl;
    data.cloudinaryPublicId = null;
    data.cloudinaryUrl = null;
    data.fileSizeBytes = null;
  } else if (file) {
    if (!isCloudinaryConfigured()) {
      throw new BusinessRuleError(
        "File uploads need Cloudinary storage configured. Add Cloudinary env vars or use a PDF link for now.",
      );
    }
    if (file.type !== "application/pdf")
      throw new BusinessRuleError("Only PDF files are accepted");
    if (file.size > MAX_FILE_SIZE)
      throw new BusinessRuleError("File size must be 20 MB or less");

    if (material.cloudinaryPublicId) {
      await deleteResource(material.cloudinaryPublicId).catch(() => {});
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const uploaded = await uploadBuffer(buffer, {
      folder: `edura/materials/${material.courseId}`,
      resource_type: "raw",
      filename: file.name || "material.pdf",
    });
    data.storageProvider = "cloudinary";
    data.cloudinaryPublicId = uploaded.public_id;
    data.cloudinaryUrl = uploaded.secure_url;
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
    await deleteResource(material.cloudinaryPublicId).catch(() => {});
  }
  await scopedDb(asAuthUser(user), (tx) =>
    tx.material.delete({ where: { id: materialId } }),
  );
  return { deleted: true };
}
