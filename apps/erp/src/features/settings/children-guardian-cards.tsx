"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { api } from "@/lib/api/client";
import { GuardianContactCard } from "@/features/settings/guardian-contact-card";

type Child = { id: string; name: string };

/**
 * The parent's side of the same field.
 *
 * A guardian email is the PARENT's address, so the parent is the person most
 * likely to notice it is wrong and the only one who can say what it should be.
 * `POST /me/guardian-contact` already accepted a `studentId` from a parent
 * holding an APPROVED link — the route has proven that link since the day it
 * was written — and nothing in the product ever sent one. This renders one card
 * per approved child, and passes the id the route already knew how to check.
 *
 * A parent with no approved link renders nothing: there is no child to speak
 * for, and an empty section explaining that belongs on the linking screen.
 */
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
