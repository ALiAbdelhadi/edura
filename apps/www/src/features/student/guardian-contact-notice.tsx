"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { ShieldAlert, X } from "lucide-react";
import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { toast } from "@repo/ui/components/sonner";
import { Spinner } from "@/components/kit/spinner";
import { api } from "@/lib/api/client";

type Status = {
  required: boolean;
  guardianEmail: string | null;
  guardianPhone: string | null;
  messagingLocked: boolean;
  dueAt: string | null;
  overdue: boolean;
  dismissable: boolean;
};

/**
 * The REQUIRED guardian-email notice.
 *
 * Shown to a MINOR who has no guardian email on file. It is not a nag about a
 * missing profile field — it is the explanation for a capability that is
 * actually switched off right now (adult-facing messaging), so it says exactly
 * that instead of hiding the reason.
 *
 * Dismissable BEFORE the deadline, permanent after it. Passing the deadline
 * never suspends the account and never unlocks messaging — it only stops the
 * notice from being dismissable and pulls the center in (see
 * runGuardianContactReminders).
 */
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
      // A role that has no guardian concept (or no profile yet) simply shows
      // nothing — this banner must never break the page it sits on.
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

  return (
    <div
      className={`rounded-lg border p-4 ${
        status.overdue
          ? "border-destructive/50 bg-destructive/5"
          : "border-amber-500/40 bg-amber-500/5"
      }`}
    >
      <div className="flex items-start gap-3">
        <ShieldAlert
          className={`mt-0.5 size-5 shrink-0 ${
            status.overdue ? "text-destructive" : "text-amber-600 dark:text-amber-400"
          }`}
        />
        <div className="min-w-0 flex-1 space-y-2">
          <p className="font-medium text-foreground">
            {status.overdue ? t("guardian.overdueTitle") : t("guardian.title")}
          </p>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {t("guardian.body")}
          </p>
          {status.messagingLocked ? (
            <p className="text-sm font-medium text-foreground">{t("guardian.locked")}</p>
          ) : null}
          {status.guardianPhone && !status.guardianEmail ? (
            <p className="text-xs text-muted-foreground">
              {t("guardian.phoneOnFile", { phone: status.guardianPhone })}
            </p>
          ) : null}

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Input
              type="email"
              dir="ltr"
              className="max-w-xs"
              placeholder={t("guardian.emailPlaceholder")}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <Button type="button" onClick={submit} disabled={saving || !email.trim()}>
              {saving ? <Spinner /> : null}
              {t("guardian.save")}
            </Button>
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
            <X className="size-4" />
          </Button>
        ) : null}
      </div>
    </div>
  );
}
