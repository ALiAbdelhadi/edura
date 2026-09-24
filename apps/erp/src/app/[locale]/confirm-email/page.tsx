"use client";

import { AuthCenteredShell } from "@/components/kit/auth-centered-shell";
import { PageSpinner } from "@/components/kit/spinner";
import { LedgerButton, ledgerTrackTight } from "@/components/ledger";
import { Link } from "@/i18n/navigation";
import { api } from "@/lib/api/client";
import { CheckCircle2, XCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

export default function ConfirmEmailPage() {
  const t = useTranslations();
  return (
    <Suspense
      fallback={
        <div className="flex min-h-dvh items-center justify-center bg-background">
          <PageSpinner label={t("common.loading")} />
        </div>
      }
    >
      <ConfirmEmailContent />
    </Suspense>
  );
}


function ConfirmEmailContent() {
  const t = useTranslations();
  const token = useSearchParams().get("token");
  const [state, setState] = useState<"working" | "done" | "error">(token ? "working" : "error");
  const [email, setEmail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    api
      .post("me/email/confirm", { json: { token } })
      .json<{ data: { email: string } }>()
      .then((res) => {
        if (cancelled) return;
        setEmail(res.data.email);
        setState("done");
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError((err as { message?: string })?.message || null);
        setState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (state === "working") {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background">
        <PageSpinner label={t("auth.confirmEmailWorking")} />
      </div>
    );
  }

  if (state === "done") {
    return (
      <AuthCenteredShell>
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="flex size-11 items-center justify-center rounded-lg" style={{ background: "var(--teal-soft)", color: "var(--teal)" }}>
            <CheckCircle2 className="size-6" />
          </div>
          <div className="space-y-1">
            <h1 className={`text-xl font-bold ${ledgerTrackTight}`} style={{ color: "var(--ink)" }}>
              {t("auth.confirmEmailDoneTitle")}
            </h1>
            <p className="text-sm" style={{ color: "var(--ink-2)" }}>
              {t("auth.confirmEmailDoneSubtitle")}
            </p>
            {email ? (
              <p className="num text-sm font-semibold" dir="ltr" style={{ color: "var(--ink)" }}>
                {email}
              </p>
            ) : null}
          </div>
          <LedgerButton asChild variant="primary" className="w-full">
            <Link href="/login">{t("auth.signInTitle")}</Link>
          </LedgerButton>
        </div>
      </AuthCenteredShell>
    );
  }

  return (
    <AuthCenteredShell>
      <div className="flex flex-col items-center gap-4 text-center">
        <div className="flex size-11 items-center justify-center rounded-lg" style={{ background: "var(--red-soft)", color: "var(--red)" }}>
          <XCircle className="size-6" />
        </div>
        <div className="space-y-1">
          <h1 className={`text-xl font-bold ${ledgerTrackTight}`} style={{ color: "var(--ink)" }}>
            {t("auth.confirmEmailInvalidTitle")}
          </h1>
          <p className="text-sm" style={{ color: "var(--ink-2)" }}>
            {error || t("auth.confirmEmailInvalidSubtitle")}
          </p>
        </div>
        <LedgerButton asChild variant="primary" className="w-full">
          <Link href="/login">{t("auth.signInTitle")}</Link>
        </LedgerButton>
      </div>
    </AuthCenteredShell>
  );
}