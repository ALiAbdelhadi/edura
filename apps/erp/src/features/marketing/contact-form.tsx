"use client";

import { LedgerButton } from "@/components/ledger";
import { track } from "@/lib/track";
import { ANALYTICS_EVENTS } from "@repo/observability";
import { CheckCircle2 } from "lucide-react";
import { useId, useState } from "react";
import styles from "./marketing.module.css";

export type ContactLabels = {
  name: string;
  namePlaceholder: string;
  email: string;
  emailPlaceholder: string;
  phone: string;
  phonePlaceholder: string;
  phoneOptional: string;
  subject: string;
  subjectDemo: string;
  subjectPricing: string;
  subjectSupport: string;
  subjectPartnership: string;
  subjectOther: string;
  message: string;
  messagePlaceholder: string;
  submit: string;
  submitting: string;
  successTitle: string;
  successBody: string;
  sendAnother: string;
  errorTitle: string;
  errorGeneric: string;
  errorRateLimited: string;
  errorValidation: string;
  required: string;
};

const SUBJECTS = [
  { value: "demo", labelKey: "subjectDemo" },
  { value: "pricing", labelKey: "subjectPricing" },
  { value: "support", labelKey: "subjectSupport" },
  { value: "partnership", labelKey: "subjectPartnership" },
  { value: "other", labelKey: "subjectOther" },
] as const;

type Status = "idle" | "sending" | "sent" | "error";

export function ContactForm({ labels, locale }: { labels: ContactLabels; locale: "ar" | "en" }) {
  const id = useId();
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [subject, setSubject] = useState<string>("demo");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (status === "sending") return;

    const form = new FormData(e.currentTarget);
    setStatus("sending");
    setError(null);

    try {
      const res = await fetch("/api/v1/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: String(form.get("name") ?? ""),
          email: String(form.get("email") ?? ""),
          phone: String(form.get("phone") ?? ""),
          subject: String(form.get("subject") ?? "other"),
          message: String(form.get("message") ?? ""),
          locale,
        }),
      });

      if (res.ok) {
        setStatus("sent");
        track(ANALYTICS_EVENTS.CONTACT_SUBMITTED, { subject });
        return;
      }

      setError(
        res.status === 429
          ? labels.errorRateLimited
          : res.status === 400 || res.status === 422
            ? labels.errorValidation
            : labels.errorGeneric,
      );
      setStatus("error");
      track(ANALYTICS_EVENTS.CONTACT_FAILED, { status: res.status });
    } catch {
      setError(labels.errorGeneric);
      setStatus("error");
      track(ANALYTICS_EVENTS.CONTACT_FAILED, { status: 0 });
    }
  }

  if (status === "sent") {
    return (
      <div className={`${styles.card} text-center`} role="status">
        <div
          className="mx-auto flex size-11 items-center justify-center rounded-full"
          style={{ background: "var(--teal-soft)", color: "var(--teal)" }}
        >
          <CheckCircle2 className="size-6" aria-hidden />
        </div>
        <h2 className="mt-4 text-lg font-bold" style={{ color: "var(--ink)" }}>
          {labels.successTitle}
        </h2>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed" style={{ color: "var(--ink-2)" }}>
          {labels.successBody}
        </p>
        <LedgerButton
          type="button"
          variant="secondary"
          className="mt-5"
          onClick={() => setStatus("idle")}
        >
          {labels.sendAnother}
        </LedgerButton>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className={`${styles.card} flex flex-col gap-4`} noValidate={false}>
      <Field id={`${id}-name`} label={labels.name}>
        <input
          id={`${id}-name`}
          name="name"
          required
          minLength={2}
          maxLength={120}
          autoComplete="name"
          placeholder={labels.namePlaceholder}
          className={inputClass}
        />
      </Field>

      <Field id={`${id}-email`} label={labels.email}>
        <input
          id={`${id}-email`}
          name="email"
          type="email"
          required
          maxLength={200}
          autoComplete="email"
          placeholder={labels.emailPlaceholder}
          dir="ltr"
          className={inputClass}
        />
      </Field>

      <Field id={`${id}-phone`} label={labels.phone} hint={labels.phoneOptional}>
        <input
          id={`${id}-phone`}
          name="phone"
          type="tel"
          maxLength={40}
          autoComplete="tel"
          placeholder={labels.phonePlaceholder}
          dir="ltr"
          className={inputClass}
        />
      </Field>

      <Field id={`${id}-subject`} label={labels.subject}>
        <select
          id={`${id}-subject`}
          name="subject"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          className={inputClass}
        >
          {SUBJECTS.map((s) => (
            <option key={s.value} value={s.value}>
              {labels[s.labelKey]}
            </option>
          ))}
        </select>
      </Field>

      <Field id={`${id}-message`} label={labels.message}>
        <textarea
          id={`${id}-message`}
          name="message"
          required
          minLength={10}
          maxLength={4000}
          rows={5}
          placeholder={labels.messagePlaceholder}
          className={`${inputClass} resize-y`}
        />
      </Field>

      {error ? (
        <div
          role="alert"
          className="rounded-lg border px-3.5 py-3 text-sm"
          style={{ borderColor: "var(--red)", color: "var(--red)", background: "var(--red-soft)" }}
        >
          <strong className="font-semibold">{labels.errorTitle}. </strong>
          {error}
        </div>
      ) : null}

      <LedgerButton type="submit" variant="primary" disabled={status === "sending"}>
        {status === "sending" ? labels.submitting : labels.submit}
      </LedgerButton>
    </form>
  );
}

const inputClass =
  "w-full rounded-lg border bg-(--paper) px-3.5 py-2.5 text-sm text-(--ink) outline-none " +
  "border-(--rule) placeholder:text-(--ink-3) focus:border-(--indigo) " +
  "focus-visible:ring-2 focus-visible:ring-(--indigo-soft)";

function Field({
  id,
  label,
  hint,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="flex items-baseline gap-2 text-[13px] font-medium">
        <span style={{ color: "var(--ink)" }}>{label}</span>
        {hint ? (
          <span className="text-xs font-normal" style={{ color: "var(--ink-3)" }}>
            {hint}
          </span>
        ) : null}
      </label>
      {children}
    </div>
  );
}
