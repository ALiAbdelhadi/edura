"use client";

import { api } from "@/lib/api/client";
import { useCustom } from "@refinedev/core";
import { ImageUploadField } from "@repo/ui/components/image-upload-field";
import { SectionHead } from "@repo/ui/components/ledger";
import { toast } from "@repo/ui/components/sonner";
import { useTranslations } from "next-intl";

type Variant = "teacherPhoto" | "centerLogo";

type ImageEndpoint = {
  mutate: string;
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
    read: "centers/me/logo",
    pick: (data) => (typeof data?.logoUrl === "string" ? data.logoUrl : null),
  },
};

const UPLOAD_TIMEOUT_MS = 60_000;

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
    const path = mutate.replace(/^\/api\/v1\//, "");
    try {
      if (method === "POST") await api.post(path, { body, timeout: UPLOAD_TIMEOUT_MS });
      else await api.delete(path, { timeout: UPLOAD_TIMEOUT_MS });
    } catch (err) {
      const status = (err as { statusCode?: number })?.statusCode;
      const details = (
        (err as { data?: { error?: { details?: { reason?: string } } } })?.data
      )?.error?.details;
      const reason = (status === 413 ? "image_too_large" : details?.reason) as
        | keyof typeof REASON_KEYS
        | undefined;
      const reasonKey = reason ? REASON_KEYS[reason] : undefined;
      const message = reasonKey
        ? t(reasonKey)
        : (err as { message?: string })?.message ||
          (method === "DELETE" ? t("shared.imageRemoveFailed") : t("shared.imageUploadFailed"));
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
