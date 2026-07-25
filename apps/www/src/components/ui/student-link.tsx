"use client";

import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";

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
  const t = useTranslations();
  const id = studentId === undefined || studentId === null ? "" : String(studentId);
  const label = name || fallback || t("shared.studentLinkUnknown");

  if (!id) {
    return <span>{label}</span>;
  }

  return (
    <Link
      href={`/dashboard/admin/students/${encodeURIComponent(id)}`}
      className="font-semibold text-primary hover:underline"
    >
      {label}
    </Link>
  );
}
