"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { api } from "@/lib/api/client";
import { GuardianContactCard } from "@/features/settings/guardian-contact-card";

type Child = { id: string; name: string };

export function ChildrenGuardianCards() {
  const t = useTranslations();
  const [children, setChildren] = useState<Child[] | null>(null);

  useEffect(() => {
    api
      .get("me/children")
      .json<{ data: Child[] }>()
      .then((res) => setChildren(res.data))
      .catch(() => setChildren([]));
  }, []);

  if (!children?.length) return null;

  return (
    <>
      {children.map((child) => (
        <GuardianContactCard
          key={child.id}
          studentId={child.id}
          title={t("shared.guardianCardForChild", { name: child.name })}
        />
      ))}
    </>
  );
}
