"use client";

import { useScene } from "@/lib/motion/use-scene";
import { EASE } from "@/lib/motion/runtime";
import { PHYSICAL } from "@/lib/motion/direction";
import { useLocale } from "next-intl";
import type { Locale } from "@/lib/i18n";

export function LedgerDiagram() {
  const locale = useLocale() as Locale;
  const ar = locale === "ar";

  const ref = useScene(({ q, gsap }) => {
    const rows = q("[data-row]");
    const denied = q("[data-denied]");

    gsap
      .timeline({
        scrollTrigger: { trigger: q("[data-root]")[0], start: "top 74%", once: true },
      })
      .fromTo(
        rows,
        { opacity: 0, y: 10 },
        { opacity: 1, y: 0, duration: 0.4, stagger: 0.14, ease: EASE.play },
      )
      .fromTo(
        denied,
        { opacity: 0, y: 6 },
        { opacity: 1, y: 0, duration: 0.45, ease: EASE.play },
        "+=0.25",
      );
  });

  const ROWS = ar
    ? [
      { ref: "TRX-2026-0118", label: "اشتراك شهري", amount: "900.00" },
      { ref: "TRX-2026-0119", label: "حصة مفردة", amount: "150.00" },
      { ref: "TRX-2026-0120", label: "تسوية حصة", amount: "60.00" },
    ]
    : [
      { ref: "TRX-2026-0118", label: "Monthly subscription", amount: "900.00" },
      { ref: "TRX-2026-0119", label: "Single lesson", amount: "150.00" },
      { ref: "TRX-2026-0120", label: "Lesson settlement", amount: "60.00" },
    ];

  return (
    <div
      ref={ref}
      data-root
      className="frame-sheet mx-auto max-w-md p-5"
      style={{ boxShadow: PHYSICAL("var(--lift)") }}
    >
      <ul>
        {ROWS.map((row) => (
          <li
            key={row.ref}
            data-row
            className="flex items-center justify-between gap-4 border-b py-3 last:border-b-0"
            style={{ borderColor: "var(--rule-2)" }}
          >
            <span className="flex flex-col">
              <span className="font-mono text-xs" style={{ color: "var(--ink-3)" }} dir="ltr">
                {row.ref}
              </span>
              <span className="text-sm" style={{ color: "var(--ink)" }}>
                {row.label}
              </span>
            </span>
            <span
              className="font-mono text-sm tabular-nums"
              style={{ color: "var(--ink)" }}
              dir="ltr"
            >
              {row.amount}
            </span>
          </li>
        ))}
      </ul>

      <div
        data-denied
        className="mt-5 rounded-(--radius-step-md) border px-4 py-3"
        style={{ borderColor: "var(--red)", backgroundColor: "var(--red-soft)" }}
      >
        <p className="font-mono text-xs" style={{ color: "var(--red)" }} dir="ltr">
          UPDATE transactions … → ERROR: permission denied
        </p>
        <p className="mt-2 text-xs leading-relaxed" style={{ color: "var(--ink-2)" }}>
          {ar
            ? "التصحيح بيبقى قيد جديد عكسي — مش تعديل على القديم."
            : "A correction is a new, reversing entry — never an edit to the old one."}
        </p>
      </div>
    </div>
  );
}
