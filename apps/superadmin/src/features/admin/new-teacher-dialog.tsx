"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { UserPlus } from "lucide-react";

import { Button } from "@repo/ui/components/button";
import { PasswordInput } from "@repo/ui/components/password-input";

import { EntityDialog, type FieldSpec } from "@/features/admin/catalog/entity-dialog";
import { useAction } from "@/lib/api/use-action";

/**
 * Admin-side teacher provisioning, modelled on `NewAccountantDialog` — the one
 * existing admin-creates-a-user path in this app.
 *
 * The role is pinned server-side in `createTeacher` and is not in the request
 * schema, so this form cannot ask for any other one. The normal way a teacher
 * arrives is still self-registration followed by approve/reject; this is the
 * override for a teacher who cannot use it.
 */
export function NewTeacherDialog({ onCreated }: { onCreated: () => void }) {
  const t = useTranslations("teachers");
  const [open, setOpen] = useState(false);
  const { run, busy } = useAction({ url: "admin/teachers" });

  const fields: FieldSpec[] = [
    { name: "name", label: t("newName"), type: "text", required: true },
    { name: "email", label: t("newEmail"), type: "email", required: true, dir: "ltr" },
    { name: "phone", label: t("newPhone"), type: "text", dir: "ltr", hint: t("newPhoneHint") },
    {
      name: "password",
      label: t("newPassword"),
      type: "custom",
      required: true,
      hint: t("newPasswordHint"),
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
    { name: "subjects", label: t("newSubjects"), type: "text", hint: t("newSubjectsHint") },
    { name: "experienceYears", label: t("newExperience"), type: "number", min: 0, max: 80 },
    { name: "qualifications", label: t("newQualifications"), type: "textarea", rows: 2 },
    {
      name: "attendanceMode",
      label: t("colMode"),
      type: "select",
      options: [
        { value: "counter_only", label: t("mode_counter_only") },
        { value: "counter_and_door", label: t("mode_counter_and_door") },
      ],
    },
  ];

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <UserPlus className="size-4" />
        {t("add")}
      </Button>

      <EntityDialog
        open={open}
        onOpenChange={setOpen}
        title={t("addTitle")}
        note={t("addBody")}
        busy={busy}
        fields={fields}
        initial={{ attendanceMode: "counter_only", experienceYears: 0 }}
        onSubmit={async (v) => {
          const phone = String(v.phone ?? "").trim();
          const qualifications = String(v.qualifications ?? "").trim();
          const subjects = String(v.subjects ?? "")
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);
          const years = Number(v.experienceYears ?? 0);

          const res = await run({
            values: {
              name: String(v.name).trim(),
              email: String(v.email).trim(),
              password: v.password,
              ...(phone ? { phone } : {}),
              ...(subjects.length ? { subjects } : {}),
              ...(qualifications ? { qualifications } : {}),
              ...(Number.isFinite(years) && years > 0
                ? { experienceYears: Math.trunc(years) }
                : {}),
              ...(v.attendanceMode ? { attendanceMode: String(v.attendanceMode) } : {}),
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
