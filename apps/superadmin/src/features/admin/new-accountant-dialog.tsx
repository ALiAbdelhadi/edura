"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@repo/ui/components/button";
import { PasswordInput } from "@repo/ui/components/password-input";

import { EntityDialog, type FieldSpec } from "@/features/admin/catalog/entity-dialog";
import { useAction } from "@/lib/api/use-action";

/**
 * The only way to provision an accountant. The role is pinned server-side and
 * never read from this body — the form cannot ask for a super admin.
 */
export function NewAccountantDialog({ onCreated }: { onCreated: () => void }) {
  const t = useTranslations("accountants");
  const [open, setOpen] = useState(false);
  const { run, busy } = useAction({ url: "admin/accountants" });

  // Save used to be disabled until three boxes were filled, saying which of
  // them was empty only by staying dead. The server also checks the password
  // (length, a letter, a digit) -- that 422 now lands under the box instead of
  // arriving as a toast with no way back to it.
  const fields: FieldSpec[] = [
    { name: "name", label: t("name"), type: "text", required: true },
    { name: "email", label: t("email"), type: "email", required: true, dir: "ltr" },
    { name: "phone", label: t("phone"), type: "text", dir: "ltr" },
    {
      name: "password",
      label: t("password"),
      type: "custom",
      required: true,
      hint: t("passwordHint"),
      render: (field) => (
        <PasswordInput
          autoComplete="new-password"
          name={field.name}
          onBlur={field.onBlur}
          value={String(field.value ?? "")}
          onChange={(e) => field.onChange(e.target.value)}
        />
      ),
    },
  ];

  return (
    <>
      <Button onClick={() => setOpen(true)}>{t("add")}</Button>

      <EntityDialog
        open={open}
        onOpenChange={setOpen}
        title={t("addTitle")}
        note={t("addBody")}
        busy={busy}
        fields={fields}
        onSubmit={async (v) => {
          const phone = String(v.phone ?? "").trim();
          const res = await run({
            values: {
              name: String(v.name).trim(),
              email: String(v.email).trim(),
              password: v.password,
              ...(phone ? { phone } : {}),
            },
            successMsg: t("created"),
          });
          if (res.ok) {
            setOpen(false);
            onCreated();
          }
          return res;
        }}
      />
    </>
  );
}
