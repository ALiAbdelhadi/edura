"use client";

import React from "react";
import Link from "next/link";
import { useI18n } from "@/components/providers/I18nProvider";

type StudentLinkProps = {
  studentId?: string | number | null;
  name?: string | null;
  fallback?: string;
};

export default function StudentLink({
  studentId,
  name,
  fallback,
}: StudentLinkProps) {
  const { t } = useI18n();
  const id = studentId === undefined || studentId === null ? "" : String(studentId);
  const label = name || fallback || t("shared.studentLinkUnknown");

  if (!id) {
    return <span>{label}</span>;
  }

  return (
    <Link
      href={`/dashboard/admin/students/${encodeURIComponent(id)}`}
      style={{ color: "#0fa5e9", fontWeight: 600 }}
    >
      {label}
    </Link>
  );
}
