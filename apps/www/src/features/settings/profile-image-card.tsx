"use client";

import { useCustom } from "@refinedev/core";
import { useTranslations } from "next-intl";

import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
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
    // The logo lives on the center record, so it is read from the center.
    read: "centers/me",
    pick: (data) => (typeof data?.logoUrl === "string" ? data.logoUrl : null),
  },
};

export function ProfileImageCard({ variant, name }: { variant: Variant; name?: string | null }) {
  const t = useTranslations();
  const { mutate, read, pick } = ENDPOINTS[variant];

  const { query, result } = useCustom({ url: read, method: "get" });
  const value = pick(result?.data as Record<string, unknown> | undefined);

  const send = async (method: "POST" | "DELETE", body?: FormData) => {
    const res = await fetch(mutate, { method, body, credentials: "same-origin" });
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      const message =
        json?.error?.message ||
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
    <Card>
      <CardHeader>
        <CardTitle>
          {variant === "teacherPhoto" ? t("shared.profilePhoto") : t("shared.centerLogo")}
        </CardTitle>
      </CardHeader>
      <CardContent>
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
      </CardContent>
    </Card>
  );
}
