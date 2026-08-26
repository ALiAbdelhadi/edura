"use client";

import { Spinner } from "@/components/kit/spinner";
import { api } from "@/lib/api/client";
import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import { SectionHead } from "@repo/ui/components/ledger";
import { toast } from "@repo/ui/components/sonner";
import { MailCheck, Save, ShieldCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";

type Status = {
  required: boolean;
  guardianEmail: string | null;
  guardianPhone: string | null;
  messagingLocked: boolean;
};

type Verification = {
  hasGuardianEmail: boolean;
  guardianEmailHint: string | null;
  verified: boolean;
};

export function GuardianContactCard({
  studentId,
  title,
}: {
  studentId?: string;
  title?: string;
}) {
  const t = useTranslations();
  const query = studentId ? `?studentId=${studentId}` : "";

  const [status, setStatus] = useState<Status | null>(null);
  const [verification, setVerification] = useState<Verification | null>(null);
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api
        .get(`me/guardian-contact${query}`)
        .json<{ data: Status }>();
      setStatus(res.data);
      setEmail(res.data.guardianEmail ?? "");
      setPhone(res.data.guardianPhone ?? "");
    } catch {
      setStatus(null);
    }
  }, [query]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (studentId) return;
    api
      .get("me/guardian-verification")
      .json<{ data: Verification }>()
      .then((res) => setVerification(res.data))
      .catch(() => setVerification(null));
  }, [studentId, status]);

  if (!status) return null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const nextEmail = email.trim();
    const nextPhone = phone.trim();
    if (!nextEmail && !nextPhone) {
      toast.error(t("shared.guardianCardNeedsOne"));
      return;
    }
    setSaving(true);
    try {
      const res = await api
        .post("me/guardian-contact", {
          json: {
            ...(nextEmail ? { guardianEmail: nextEmail } : {}),
            ...(nextPhone ? { guardianPhone: nextPhone } : {}),
            ...(studentId ? { studentId } : {}),
          },
        })
        .json<{ data: Status }>();
      setStatus(res.data);
      toast.success(t("guardian.saved"));
    } catch (err: unknown) {
      toast.error((err as { message?: string })?.message ?? t("guardian.saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  const resend = async () => {
    setSending(true);
    try {
      const res = await api
        .post("me/guardian-verification", { json: {} })
        .json<{ data: { guardianEmailHint: string } }>();
      toast.success(t("guardian.verifySent", { email: res.data.guardianEmailHint }));
    } catch (err: unknown) {
      toast.error((err as { message?: string })?.message ?? t("guardian.verifyFailed"));
    } finally {
      setSending(false);
    }
  };

  const unverified =
    !studentId && verification?.hasGuardianEmail && !verification.verified;

  return (
    <section className="flex flex-col gap-3">
      <SectionHead
        title={
          <span className="flex items-center gap-2">
            <ShieldCheck className="size-4" aria-hidden />
            {title ?? t("shared.guardianCardTitle")}
          </span>
        }
      />
      <div className="rounded-xl border border-rule bg-sheet p-4">
        <p className="mb-4 text-[13px] text-ink-3">{t("shared.guardianCardSubtitle")}</p>
        {status.messagingLocked ? (
          <p className="mb-4 rounded-lg bg-amber-soft px-3 py-2 text-sm font-semibold text-amber">
            {t("guardian.locked")}
          </p>
        ) : null}
        <form className="grid gap-4" onSubmit={submit}>
          <div className="grid gap-1.5">
            <Label htmlFor={`gc-email-${studentId ?? "self"}`}>
              {t("shared.guardianCardEmail")}
            </Label>
            <Input
              id={`gc-email-${studentId ?? "self"}`}
              type="email"
              dir="ltr"
              className="num"
              placeholder={t("shared.guardianCardEmailPlaceholder")}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <p className="text-xs text-ink-3">{t("shared.guardianCardEmailHint")}</p>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`gc-phone-${studentId ?? "self"}`}>
              {t("shared.guardianCardPhone")}
            </Label>
            <Input
              id={`gc-phone-${studentId ?? "self"}`}
              dir="ltr"
              className="num"
              placeholder={t("shared.guardianCardPhonePlaceholder")}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
            <p className="text-xs text-ink-3">{t("shared.guardianCardPhoneHint")}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" disabled={saving}>
              {saving ? <Spinner /> : <Save className="size-4" aria-hidden />}
              {t("guardian.save")}
            </Button>
            {unverified ? (
              <Button type="button" variant="outline" onClick={resend} disabled={sending}>
                {sending ? <Spinner /> : <MailCheck className="size-4" aria-hidden />}
                {t("guardian.verifyResend")}
              </Button>
            ) : null}
          </div>
        </form>
      </div>
    </section>
  );
}
