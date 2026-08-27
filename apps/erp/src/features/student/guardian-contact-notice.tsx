"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { ShieldAlert, X } from "lucide-react";
import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { toast } from "@repo/ui/components/sonner";
import { Spinner } from "@/components/kit/spinner";
import { api } from "@/lib/api/client";
import { LedgerButton, Sheet } from "@/features/student/ledger";

type Status = {
  required: boolean;
  guardianEmail: string | null;
  guardianPhone: string | null;
  messagingLocked: boolean;
  dueAt: string | null;
  overdue: boolean;
  dismissable: boolean;
};

export function GuardianContactNotice({ studentId }: { studentId?: string }) {
  const t = useTranslations();
  const [status, setStatus] = useState<Status | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);

  const query = studentId ? `?studentId=${studentId}` : "";

  const load = useCallback(async () => {
    try {
      const res = await api
        .get(`me/guardian-contact${query}`)
        .json<{ data: Status }>();
      setStatus(res.data);
    } catch {
      setStatus(null);
    }
  }, [query]);

  useEffect(() => {
    void load();
  }, [load]);

  const submit = async () => {
    setSaving(true);
    try {
      const res = await api
        .post("me/guardian-contact", {
          json: {
            guardianEmail: email.trim(),
            ...(studentId ? { studentId } : {}),
          },
        })
        .json<{ data: Status }>();
      setStatus(res.data);
      setEmail("");
      toast.success(t("guardian.saved"));
    } catch (err: any) {
      toast.error(err?.message || t("guardian.saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  if (!status?.required) return null;
  if (dismissed && status.dismissable) return null;

  const tone = status.overdue ? "red" : "amber";

  return (
    <Sheet blocking={status.overdue} className="p-5">
      <div className="flex items-start gap-3">
        <ShieldAlert
          className="mt-0.5 size-5 shrink-0"
          style={{ color: status.overdue ? "var(--red)" : "var(--amber)" }}
          aria-hidden
        />
        <div className="min-w-0 flex-1 space-y-2">
          <p className="text-[15px] font-semibold" style={{ color: "var(--ink)" }}>
            {status.overdue ? t("guardian.overdueTitle") : t("guardian.title")}
          </p>

          {status.messagingLocked ? (
            <p
              className="rounded-lg px-3 py-2 text-sm font-semibold"
              style={{
                color: `var(--${tone})`,
                background: `var(--${tone}-soft)`,
              }}
            >
              {t("guardian.locked")}
            </p>
          ) : null}

          <p className="max-w-[68ch] text-sm leading-relaxed" style={{ color: "var(--ink-2)" }}>
            {t("guardian.body")}
          </p>

          {status.guardianPhone && !status.guardianEmail ? (
            <p className="text-xs" style={{ color: "var(--ink-3)" }}>
              {t("guardian.phoneOnFile", { phone: status.guardianPhone })}
            </p>
          ) : null}

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Input
              type="email"
              dir="ltr"
              className="max-w-xs"
              aria-label={t("guardian.emailPlaceholder")}
              placeholder={t("guardian.emailPlaceholder")}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <LedgerButton
              type="button"
              variant="primary"
              onClick={submit}
              disabled={saving || !email.trim()}
            >
              {saving ? <Spinner /> : null}
              {t("guardian.save")}
            </LedgerButton>
          </div>
        </div>

        {status.dismissable ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={t("actions.cancel")}
            onClick={() => setDismissed(true)}
          >
            <X className="size-4" aria-hidden />
          </Button>
        ) : null}
      </div>
    </Sheet>
  );
}
