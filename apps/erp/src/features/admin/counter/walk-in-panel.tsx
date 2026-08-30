"use client";

import type { InviteDelivery } from "@/components/kit/invite-link";
import { useCustomMutation } from "@refinedev/core";
import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { toast } from "@repo/ui/components/sonner";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Eyebrow } from "../ledger";


export type WalkInInvite = {
  link: string;
  delivery: InviteDelivery;
  guardianEmailRequired: boolean;
  studentId: string;
  name: string;
};

export type WalkInCreated = {
  studentId: string;
  fullName: string | null;
  studentCode: string | null;
  phone: string;
  existing: boolean;
  onOurRoster: boolean;
};

export function WalkInPanel({
  onCreated,
  onInvite,
  busy,
  setBusy,
}: {
  onCreated: (student: WalkInCreated) => void | Promise<void>;
  onInvite: (invite: WalkInInvite) => void;
  busy: boolean;
  setBusy: (busy: boolean) => void;
}) {
  const t = useTranslations();
  const { mutateAsync: post } = useCustomMutation();

  const [walkName, setWalkName] = useState("");
  const [walkPhone, setWalkPhone] = useState("");
  const [guardianEmail, setGuardianEmail] = useState("");
  const [guardianPhone, setGuardianPhone] = useState("");

  const createWalkIn = async () => {
    if (walkName.trim().length < 2 || walkPhone.trim().length < 8) {
      toast.error(t("shared.checkin.walkInMissing"));
      return;
    }
    setBusy(true);
    try {
      const res = await post({
        url: "center/walk-in",
        method: "post",
        values: {
          fullName: walkName.trim(),
          phone: walkPhone.trim(),
          ...(guardianEmail.trim() ? { guardianEmail: guardianEmail.trim() } : {}),
          ...(guardianPhone.trim() ? { guardianPhone: guardianPhone.trim() } : {}),
        },
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = (res as any)?.data?.data ?? (res as any)?.data;
      if (data.existing && data.onOurRoster === false) {
        // Recognised, but this centre does not have them on its roster: nothing
        // was sent and no code is disclosed. Adding them is a separate step.
        toast.warning(t("shared.checkin.existingElsewhere"));
      } else {
        toast.success(
          data.existing
            ? t("shared.checkin.existingResent", { code: data.studentCode ?? "" })
            : t("shared.checkin.walkInCreated"),
        );
      }

      const invite = data.invite;
      if (invite?.email?.status === "sent") {
        toast.success(t("shared.checkin.inviteEmailSent"));
      } else if (invite?.guardianEmailRequired) {
        toast.warning(t("shared.checkin.guardianEmailMissing"));
      }
      if (invite?.claimLink) {
        onInvite({
          link: invite.claimLink,
          delivery: invite.email?.status ?? "no_recipient",
          guardianEmailRequired: !!invite.guardianEmailRequired,
          studentId: data.studentId,
          name: data.fullName ?? "",
        });
      }

      const phone = walkPhone.trim();
      setWalkName("");
      setWalkPhone("");
      setGuardianEmail("");
      setGuardianPhone("");
      await onCreated({
        studentId: data.studentId,
        fullName: data.fullName ?? null,
        studentCode: data.studentCode ?? null,
        phone,
        existing: !!data.existing,
        onOurRoster: data.onOurRoster !== false,
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      toast.error(err?.message || t("shared.checkin.walkInFailed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="lg-field flex flex-col gap-2.5 p-3.5">
      <Input
        className="h-12 text-base"
        placeholder={t("shared.checkin.walkInName")}
        value={walkName}
        onChange={(e) => setWalkName(e.target.value)}
      />
      <Input
        className="num h-12 text-base"
        placeholder={t("shared.checkin.walkInPhone")}
        dir="ltr"
        inputMode="tel"
        value={walkPhone}
        onChange={(e) => setWalkPhone(e.target.value)}
      />
      <div className="rounded-lg border border-(--rule) bg-(--sheet) p-3">
        <Eyebrow>{t("shared.checkin.guardianContactTitle")}</Eyebrow>
        <div className="mt-2 flex flex-col gap-2">
          <Input
            className="num h-12 text-base"
            placeholder={t("shared.checkin.guardianEmail")}
            type="email"
            dir="ltr"
            value={guardianEmail}
            onChange={(e) => setGuardianEmail(e.target.value)}
          />
          <Input
            className="num h-12 text-base"
            placeholder={t("shared.checkin.guardianPhone")}
            dir="ltr"
            inputMode="tel"
            value={guardianPhone}
            onChange={(e) => setGuardianPhone(e.target.value)}
          />
        </div>
        <p className="mt-2 mb-0 text-xs leading-relaxed text-(--ink-2)">
          {t("shared.checkin.guardianContactHint")}
        </p>
      </div>
      <Button className="h-12" onClick={createWalkIn} disabled={busy}>
        {t("shared.checkin.walkInCreate")}
      </Button>
    </div>
  );
}