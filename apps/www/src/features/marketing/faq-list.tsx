"use client";

import { track } from "@/lib/track";
import { ChevronDown } from "lucide-react";
import styles from "./marketing.module.css";

/**
 * Native <details>/<summary>, not a JS accordion.
 *
 * Every answer is in the DOM and readable with JavaScript disabled or still
 * loading — which matters here, because an FAQ that renders as ten bare
 * questions until hydration is an FAQ nobody reads. The chevron rotation is
 * CSS on `[open]`; the only JavaScript is the one `track()` call.
 *
 * `name` is deliberately NOT set: several questions are often open at once
 * while comparing answers, and an exclusive accordion fights that.
 */
export function FaqList({
  items,
}: {
  items: readonly { id: string; question: string; answer: string }[];
}) {
  return (
    <ul className="flex flex-col gap-2.5">
      {items.map((item) => (
        <li key={item.id}>
          <details
            className={`${styles.cardMuted} group`}
            onToggle={(e) => {
              if ((e.currentTarget as HTMLDetailsElement).open) {
                track("faq_opened", { question: item.id });
              }
            }}
          >
            <summary className="flex cursor-pointer list-none items-start justify-between gap-4">
              <span className="text-[15px] font-semibold" style={{ color: "var(--ink)" }}>
                {item.question}
              </span>
              <ChevronDown
                className="mt-0.5 size-4 shrink-0 transition-transform duration-150 group-open:rotate-180 motion-reduce:transition-none"
                style={{ color: "var(--ink-3)" }}
                aria-hidden
              />
            </summary>
            <p className="mt-3 text-sm leading-relaxed" style={{ color: "var(--ink-2)" }}>
              {item.answer}
            </p>
          </details>
        </li>
      ))}
    </ul>
  );
}
