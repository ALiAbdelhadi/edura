"use client";

import { useId, useState } from "react";

import type { Locale } from "@/i18n/config";
import type { Pages } from "@/i18n/pages";

type Copy = Pages["contact"]["form"];
type State = "idle" | "sending" | "sent" | "failed" | "limited";

const SUBJECTS = ["pricing", "support", "other"] as const;

export function ContactForm({ locale, copy }: { locale: Locale; copy: Copy }) {
  const [state, setState] = useState<State>("idle");
  const id = useId();

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (state === "sending") return;

    const data = new FormData(event.currentTarget);
    setState("sending");

    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: String(data.get("name") ?? ""),
          email: String(data.get("email") ?? ""),
          phone: String(data.get("phone") ?? ""),
          subject: String(data.get("subject") ?? "other"),
          message: String(data.get("message") ?? ""),
          locale,
        }),
      });
      if (response.status === 429) setState("limited");
      else if (!response.ok) setState("failed");
      else setState("sent");
    } catch {
      setState("failed");
    }
  }

  if (state === "sent") {
    return (
      <div className="max-w-[52ch]" role="status">
        <span aria-hidden="true" className="grid h-10 w-10 place-items-center rounded-[var(--radius-step-sm)] bg-pen-soft text-pen">
          <svg viewBox="0 0 16 16" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="m3.5 8.5 3 3 6-7" />
          </svg>
        </span>
        <h3 className="t-h3 mt-5 text-ink">{copy.ok.title}</h3>
        <p className="mt-2 text-ink-2">{copy.ok.body}</p>
      </div>
    );
  }

  const label = "block text-[0.9375rem] font-medium text-ink";

  return (
    <form onSubmit={onSubmit} className="grid w-full gap-6" noValidate={false}>
      <fieldset className="min-w-0">
        <legend className={label}>{copy.subject}</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {SUBJECTS.map((subject, index) => (
            <label key={subject} className="pick">
              <input
                type="radio"
                name="subject"
                value={subject}
                defaultChecked={index === 0}
                required
                className="sr-only"
              />
              {copy.subjects[subject]}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-6 sm:grid-cols-2 sm:gap-x-4">
        <div>
          <label htmlFor={`${id}-name`} className={label}>
            {copy.name}
          </label>
          <input
            id={`${id}-name`}
            name="name"
            required
            minLength={2}
            maxLength={120}
            autoComplete="name"
            className="form-field mt-2"
          />
          <p className="field-error">{copy.badName}</p>
        </div>

        <div>
          <label htmlFor={`${id}-email`} className={label}>
            {copy.email}
          </label>
          <input
            id={`${id}-email`}
            name="email"
            type="email"
            required
            maxLength={200}
            autoComplete="email"
            dir="ltr"
            className="form-field mt-2 text-start"
          />
          <p className="field-error">{copy.badEmail}</p>
        </div>

        <div className="sm:col-span-2">
          <label htmlFor={`${id}-phone`} className={label}>
            {copy.phone}
          </label>
          <input
            id={`${id}-phone`}
            name="phone"
            type="tel"
            maxLength={40}
            autoComplete="tel"
            dir="ltr"
            className="form-field mt-2 text-start sm:max-w-[calc(50%-0.5rem)]"
          />
        </div>
      </div>

      <div>
        <label htmlFor={`${id}-message`} className={label}>
          {copy.message}
        </label>
        <textarea
          id={`${id}-message`}
          name="message"
          required
          minLength={10}
          maxLength={4000}
          rows={6}
          className="form-field mt-2 resize-y leading-[1.8]"
        />
        <p className="field-error">{copy.minMessage}</p>
      </div>

      <div className="flex flex-wrap items-center gap-4 border-t border-rule pt-6">
        <button
          type="submit"
          className="btn btn-pen w-full disabled:cursor-wait disabled:opacity-70 sm:w-auto"
          disabled={state === "sending"}
        >
          {state === "sending" ? copy.sending : copy.submit}
        </button>

        <p role="status" aria-live="polite" className="text-[0.9375rem] text-red">
          {state === "failed" ? copy.failed : state === "limited" ? copy.limited : ""}
        </p>
      </div>
    </form>
  );
}
