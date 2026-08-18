"use client";

import { useId, useState } from "react";
import { Button } from "@repo/ui/components/button";

import type { Locale } from "@/i18n/config";
import type { Pages } from "@/i18n/pages";

type Copy = Pages["contact"]["form"];
type State = "idle" | "sending" | "sent" | "failed" | "limited";

const SUBJECTS = ["demo", "pricing", "support", "partnership", "other"] as const;

/**
 * The only interactive form on this site.
 *
 * It posts to `/api/contact` on THIS origin, which forwards to the product
 * app's existing endpoint — one backend, one inbox. See that route for why it
 * is a proxy.
 *
 * Three things it does that a default form does not:
 *
 *  - IT IS A REAL `<form>` WITH REAL LABELS. Every field has a `<label for>`,
 *    not a placeholder standing in for one: a placeholder disappears the
 *    moment you type, so a reader who looks away loses the name of the field
 *    they are in, and a screen reader may never announce it at all.
 *  - ERRORS ARE ANNOUNCED, not just coloured. The status line is a live
 *    region, so a failure reaches somebody who cannot see the colour change.
 *  - THE SUCCESS STATE REPLACES THE FORM. Leaving a filled-in form on screen
 *    under a green tick invites a second identical submission, which is how
 *    one question becomes three rows in the inbox.
 */
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
      <div className="max-w-[52ch] border-t-2 border-ink pt-6" role="status">
        <h3 className="display text-[1.25rem] leading-snug text-ink">{copy.ok.title}</h3>
        <p className="mt-3 text-[0.9375rem] leading-[1.75] text-ink-2">{copy.ok.body}</p>
      </div>
    );
  }

  /* `min-h-11` = 44px. Measured: the `<select>` came out at 43 — one pixel
     under the touch floor, because a select's intrinsic line box is shorter
     than an input's at the same padding. A floor on the shared class fixes
     the select and guarantees the rest rather than leaving each to chance. */
  const field =
    "w-full min-h-11 border border-rule bg-sheet px-3 py-2.5 text-[0.9375rem] text-ink outline-none focus-visible:border-gold";
  const labelClass = "block text-[0.8125rem] font-semibold text-ink";

  return (
    <form onSubmit={onSubmit} className="grid max-w-[44rem] gap-5" noValidate={false}>
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor={`${id}-name`} className={labelClass}>
            {copy.name}
          </label>
          <input
            id={`${id}-name`}
            name="name"
            required
            minLength={2}
            maxLength={120}
            autoComplete="name"
            className={`mt-2 ${field}`}
          />
        </div>

        <div>
          <label htmlFor={`${id}-email`} className={labelClass}>
            {copy.email}
          </label>
          <input
            id={`${id}-email`}
            name="email"
            type="email"
            required
            maxLength={200}
            autoComplete="email"
            // The address is Latin even on an Arabic page, and an RTL input
            // would put the cursor and the @ on the wrong side of it.
            dir="ltr"
            className={`mt-2 ${field} text-start`}
          />
        </div>

        <div>
          <label htmlFor={`${id}-phone`} className={labelClass}>
            {copy.phone}
          </label>
          <input
            id={`${id}-phone`}
            name="phone"
            type="tel"
            maxLength={40}
            autoComplete="tel"
            dir="ltr"
            className={`mt-2 ${field} text-start`}
          />
        </div>

        <div>
          <label htmlFor={`${id}-subject`} className={labelClass}>
            {copy.subject}
          </label>
          {/* A native `<select>`, not a custom listbox: it is five options, and
              the platform's own control is the one every phone already knows
              how to open. */}
          <select id={`${id}-subject`} name="subject" required className={`mt-2 ${field}`}>
            {SUBJECTS.map((subject) => (
              <option key={subject} value={subject}>
                {copy.subjects[subject]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label htmlFor={`${id}-message`} className={labelClass}>
          {copy.message}
        </label>
        <textarea
          id={`${id}-message`}
          name="message"
          required
          minLength={10}
          maxLength={4000}
          rows={6}
          className={`mt-2 ${field} resize-y`}
        />
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <Button type="submit" variant="ledger" size="ledger" className="tap" disabled={state === "sending"}>
          {state === "sending" ? copy.sending : copy.submit}
        </Button>

        {/* Live region: a failure has to reach a reader who cannot see the
            colour it is written in. */}
        <p role="status" aria-live="polite" className="text-[0.875rem] text-red">
          {state === "failed" ? copy.failed : state === "limited" ? copy.limited : ""}
        </p>
      </div>
    </form>
  );
}
