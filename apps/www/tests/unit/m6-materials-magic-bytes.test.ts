import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// M6 — materials upload must verify the REAL file bytes (%PDF- magic), not the
// client-declared file.type. A spoofed application/pdf carrying HTML/SVG/EXE
// must be rejected on BOTH the create and update paths, and must never reach
// storage. A genuine PDF still uploads.
//
// Only the external boundaries are mocked (Cloudinary, the db scope, notify);
// the magic-byte gate under test runs for real.

const h = vi.hoisted(() => ({
  uploadBuffer: vi.fn(async () => ({ public_id: "pub-1", secure_url: "https://cdn/x.pdf", bytes: 123 })),
  deleteResource: vi.fn(async () => {}),
  isCloudinaryConfigured: vi.fn(() => true),
  notify: vi.fn(async () => {}),
}));

vi.mock("@/lib/cloudinary/cloudinary", () => ({
  uploadBuffer: h.uploadBuffer,
  deleteResource: h.deleteResource,
  isCloudinaryConfigured: h.isCloudinaryConfigured,
  generateSignedUrl: vi.fn(async () => "https://cdn/signed"),
}));

vi.mock("@/lib/services/notifications/notify", () => ({ notify: h.notify }));

// A fake tenant tx that serves every method the two paths touch. The owning
// teacher is always TEACHER_ID so ownership passes and we reach the file gate.
const TEACHER_ID = "teacher-1";
const fakeTx = {
  course: { findUnique: vi.fn(async () => ({ id: "course-1", centerId: "center-1", teacherId: TEACHER_ID })) },
  material: {
    findUnique: vi.fn(async () => ({ id: "mat-1", teacherId: TEACHER_ID, courseId: "course-1", cloudinaryPublicId: "old-pub" })),
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: "mat-1", ...data })),
    update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: "mat-1", ...data })),
  },
  enrollment: { findMany: vi.fn(async () => [] as { studentId: string }[]) },
};

vi.mock("@/lib/db/scope", () => ({
  // scopedDb(user, fn) just runs fn with the fake tx.
  scopedDb: (_user: unknown, fn: (tx: unknown) => unknown) => fn(fakeTx),
}));

import { uploadMaterial, updateMaterial } from "@/lib/services/materials/materials";

const user = { id: TEACHER_ID, role: "teacher", centerId: "center-1" } as never;

// Real PDF header + a spoofed "PDF" that is actually HTML.
const REAL_PDF = new Uint8Array([...Buffer.from("%PDF-1.4\n", "latin1"), ...Buffer.from("body", "latin1")]);
const SPOOFED_HTML = Buffer.from("<html><script>alert(1)</script></html>", "latin1");

const pdfNamed = (bytes: BufferSource) =>
  new File([bytes], "material.pdf", { type: "application/pdf" }); // declared type always claims PDF

const createForm = (file: File) => {
  const fd = new FormData();
  fd.set("courseId", "course-1");
  fd.set("title", "Lecture 1");
  fd.set("type", "lecture");
  fd.set("file", file);
  return fd;
};

const updateForm = (file: File) => {
  const fd = new FormData();
  fd.set("file", file);
  return fd;
};

afterEach(() => vi.clearAllMocks());
beforeEach(() => h.isCloudinaryConfigured.mockReturnValue(true));

describe("M6 — create path (uploadMaterial)", () => {
  it("rejects a spoofed application/pdf whose real bytes are HTML — nothing stored", async () => {
    await expect(uploadMaterial(createForm(pdfNamed(SPOOFED_HTML)), user)).rejects.toThrow(
      "Only PDF files are accepted",
    );
    expect(h.uploadBuffer).not.toHaveBeenCalled();
    expect(fakeTx.material.create).not.toHaveBeenCalled();
  });

  it("accepts a genuine %PDF- file — stored once", async () => {
    const res = await uploadMaterial(createForm(pdfNamed(REAL_PDF)), user);
    expect(h.uploadBuffer).toHaveBeenCalledTimes(1);
    expect(fakeTx.material.create).toHaveBeenCalledTimes(1);
    expect((res as { cloudinaryPublicId?: string }).cloudinaryPublicId).toBe("pub-1");
  });
});

describe("M6 — update path (updateMaterial)", () => {
  it("rejects a spoofed application/pdf — nothing stored, existing resource NOT deleted", async () => {
    await expect(updateMaterial("mat-1", updateForm(pdfNamed(SPOOFED_HTML)), user)).rejects.toThrow(
      "Only PDF files are accepted",
    );
    expect(h.uploadBuffer).not.toHaveBeenCalled();
    expect(h.deleteResource).not.toHaveBeenCalled(); // verify-before-delete: old PDF survives
    expect(fakeTx.material.update).not.toHaveBeenCalled();
  });

  it("accepts a genuine %PDF- file — old resource replaced, stored once", async () => {
    await updateMaterial("mat-1", updateForm(pdfNamed(REAL_PDF)), user);
    expect(h.uploadBuffer).toHaveBeenCalledTimes(1);
    expect(h.deleteResource).toHaveBeenCalledTimes(1);
    expect(fakeTx.material.update).toHaveBeenCalledTimes(1);
  });
});
