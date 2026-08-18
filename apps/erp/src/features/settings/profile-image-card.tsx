"use client";

import { useCustom } from "@refinedev/core";
import { useTranslations } from "next-intl";

import { SectionHead } from "@repo/ui/components/ledger";
import { ImageUploadField } from "@repo/ui/components/image-upload-field";
import { toast } from "@repo/ui/components/sonner";

/**
 * Profile imagery in Settings — a teacher's photo and a center's logo share
 * one card because they share one shape: read the current URL, upload a
 * replacement, or clear it.
 *
 * The heavy lifting (drag-drop, preview, client-side downscale before the
 * request, error states) lives in @repo/ui's ImageUploadField; this file only
 * supplies the endpoint, the translated labels, and the refetch.
 */

type Variant = "teacherPhoto" | "centerLogo";

type ImageEndpoint = {
  /** Multipart POST / DELETE target. */
  mutate: string;
  /** Refine resource for the read (the value lives on the entity record). */
  read: string;
  pick: (data: Record<string, unknown> | undefined) => string | null;
};

const ENDPOINTS: Record<Variant, ImageEndpoint> = {
  teacherPhoto: {
    mutate: "/api/v1/teachers/me/photo",
    read: "teachers/me/photo",
    pick: (data) => (typeof data?.photoUrl === "string" ? data.photoUrl : null),
  },
  centerLogo: {
    mutate: "/api/v1/centers/me/logo",
    // Read from the logo resource itself, NOT from `centers/me`: that route is
    // center_admin-only, so a manager who may replace the logo could not read
    // it. Every verb on this resource now sits behind one gate.
    read: "centers/me/logo",
    pick: (data) => (typeof data?.logoUrl === "string" ? data.logoUrl : null),
  },
};

/**
 * The refusal codes the media kernel emits, mapped to translated copy.
 *
 * The server's `message` is English — it is written for logs. Reading it
 * straight into a toast is what put "Only JPEG, PNG, WebP, GIF, or AVIF images
 * are accepted" on an Arabic screen. `details.reason` is the stable contract;
 * an unknown code still falls through to the generic translated failure rather
 * than to English.
 */
const REASON_KEYS = {
  image_too_large: "shared.imageTooLarge",
  unsupported_image_type: "shared.imageWrongType",
  uploads_not_configured: "shared.imageUploadsUnavailable",
} as const;

export function ProfileImageCard({ variant, name }: { variant: Variant; name?: string | null }) {
  const t = useTranslations();
  const { mutate, read, pick } = ENDPOINTS[variant];

  const { query, result } = useCustom({ url: read, method: "get" });
  const value = pick(result?.data as Record<string, unknown> | undefined);

  const send = async (method: "POST" | "DELETE", body?: FormData) => {
    const res = await fetch(mutate, { method, body, credentials: "same-origin" });
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      // 413 is the one refusal that never carries our envelope: the platform
      // kills an oversized body at the edge, so `json` is null and there is no
      // reason code to read. The image cap is set below that limit precisely so
      // this cannot fire — it is mapped anyway because a proxy in front of a
      // future deployment may hold a tighter one, and "too large" is far more
      // actionable than a generic failure.
      const reason = (res.status === 413 ? "image_too_large" : json?.error?.details?.reason) as
        | keyof typeof REASON_KEYS
        | undefined;
      const reasonKey = reason ? REASON_KEYS[reason] : undefined;
      const message = reasonKey
        ? t(reasonKey)
        : method === "DELETE"
          ? t("shared.imageRemoveFailed")
          : t("shared.imageUploadFailed");
      toast.error(message);
      throw new Error(message);
    }
    await query.refetch();
  };

  const handleUpload = async (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    await send("POST", fd);
    toast.success(t("shared.imageUploaded"));
  };

  const handleRemove = async () => {
    await send("DELETE");
    toast.success(t("shared.imageRemoved"));
  };

  return (
    <section className="flex flex-col gap-3">
      <SectionHead
        title={<>
          {variant === "teacherPhoto" ? t("shared.profilePhoto") : t("shared.centerLogo")}
        </>}
      />
      <div className="rounded-xl border border-rule bg-sheet p-4">
        <ImageUploadField
          value={value}
          name={name}
          variant={variant === "teacherPhoto" ? "avatar" : "logo"}
          disabled={query.isLoading}
          onUpload={handleUpload}
          onRemove={value ? handleRemove : undefined}
          labels={{
            upload: t("shared.imageUpload"),
            replace: t("shared.imageReplace"),
            remove: t("shared.imageRemove"),
            uploading: t("shared.imageUploading"),
            dropHint: t("shared.imageDropHint"),
            tooLarge: t("shared.imageTooLarge"),
            wrongType: t("shared.imageWrongType"),
            failed: t("shared.imageUploadFailed"),
          }}
        />
      </div>
    </section>
  );
}
