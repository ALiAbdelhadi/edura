"use client";

import { Spinner } from "@/components/kit/spinner";
import { Button } from "@repo/ui/components/button";
import { CircleAlert, CircleCheck, ShieldCheck } from "lucide-react";
import { useState } from "react";

const COPY = {
  ar: {
    title: "تأكيد بريد ولي الأمر",
    lead: "اضغط الزر لتأكيد أن هذا البريد يخصّك كولي أمر للطالب.",
    noop: "التأكيد لا يسجّل دخولك ولا يمنحك أي صلاحية — كل ما يفعله هو إثبات أن البريد يصل إليك.",
    cta: "تأكيد",
    working: "جارٍ التأكيد…",
    okTitle: "تم التأكيد",
    okBody: (hint: string) => `شكرًا لك. تم تأكيد البريد ${hint}. لا يلزم أي إجراء آخر.`,
    badTitle: "الرابط غير صالح",
    badBody:
      "الرابط منتهي الصلاحية أو تم استخدامه من قبل، أو تم تغيير البريد بعد إرساله. اطلب رابطًا جديدًا من داخل التطبيق.",
    missing: "هذا الرابط ناقص. افتح الرابط كاملًا من رسالة البريد.",
  },
  en: {
    title: "Confirm guardian email",
    lead: "Press the button to confirm this address is yours as the student's guardian.",
    noop: "Confirming does not sign you in and grants you no access — all it does is prove the address reaches you.",
    cta: "Confirm",
    working: "Confirming…",
    okTitle: "Confirmed",
    okBody: (hint: string) => `Thank you. ${hint} is confirmed. Nothing else is needed.`,
    badTitle: "This link is not valid",
    badBody:
      "It has expired, was already used, or the address changed after it was sent. Ask for a new link from inside the app.",
    missing: "This link is incomplete. Open the full link from the email.",
  },
} as const;

type Phase = { k: "idle" } | { k: "busy" } | { k: "ok"; hint: string } | { k: "bad" };

export function GuardianVerifyScreen({
  locale,
  token,
}: {
  locale: "ar" | "en";
  token: string | null;
}) {
  const t = COPY[locale];
  const [phase, setPhase] = useState<Phase>({ k: "idle" });

  async function confirm() {
    if (!token) return;
    setPhase({ k: "busy" });
    try {
      const res = await fetch("/api/v1/guardian/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const json = (await res.json()) as
        | { data: { verified: true; emailHint: string } }
        | { error: { message: string } };
      if (!res.ok || "error" in json) {
        setPhase({ k: "bad" });
        return;
      }
      setPhase({ k: "ok", hint: json.data.emailHint });
    } catch {
      setPhase({ k: "bad" });
    }
  }

  return (
    <div
      dir={locale === "ar" ? "rtl" : "ltr"}
      lang={locale}
      className="mx-auto flex min-h-screen max-w-lg flex-col justify-center gap-5 px-5 py-10"
    >
      <div className="flex items-center gap-2.5">
        <ShieldCheck className="size-6 text-[var(--indigo)]" aria-hidden />
        <h1 className="text-[19px] font-semibold text-[var(--ink)]">{t.title}</h1>
      </div>

      {phase.k === "ok" ? (
        <div className="flex items-start gap-3 rounded-(--radius-step-md) border border-[var(--teal)] bg-[var(--teal-soft)] p-4">
          <CircleCheck className="mt-0.5 size-5 shrink-0 text-[var(--teal)]" aria-hidden />
          <div>
            <p className="font-semibold text-[var(--ink)]">{t.okTitle}</p>
            <p className="mt-1 text-sm text-[var(--ink-2)]">{t.okBody(phase.hint)}</p>
          </div>
        </div>
      ) : phase.k === "bad" ? (
        <div className="flex items-start gap-3 rounded-(--radius-step-md) border border-destructive bg-[var(--red-soft)] p-4">
          <CircleAlert className="mt-0.5 size-5 shrink-0 text-destructive" aria-hidden />
          <div>
            <p className="font-semibold text-[var(--ink)]">{t.badTitle}</p>
            <p className="mt-1 text-sm text-[var(--ink-2)]">{t.badBody}</p>
          </div>
        </div>
      ) : !token ? (
        <p className="text-sm text-[var(--ink-2)]">{t.missing}</p>
      ) : (
        <>
          <p className="text-sm leading-relaxed text-[var(--ink-2)]">{t.lead}</p>
          <p className="text-[12.5px] leading-relaxed text-[var(--ink-3)]">{t.noop}</p>
          <div>
            <Button onClick={confirm} disabled={phase.k === "busy"} data-testid="guardian-confirm">
              {phase.k === "busy" ? (
                <>
                  <Spinner className="size-4" /> {t.working}
                </>
              ) : (
                t.cta
              )}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
