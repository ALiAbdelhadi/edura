"use client";

import { useScene } from "@/lib/motion/use-scene";
import { EASE } from "@/lib/motion/runtime";
import { useLocale } from "next-intl";
import type { Locale } from "@/lib/i18n";

/**
 * The child-safety scene — the site's second-most-expensive piece of motion,
 * and the one /parents leads with.
 *
 * It draws its own condition rather than asserting it. The shield's outline is
 * stroked by DrawSVG as the reader arrives, which is exactly the kind of motion
 * D-044 permits: the drawing IS the explanation of a rule that is otherwise a
 * paragraph.
 *
 * The rule it depicts is `isMinor()` in packages/database/src/queries/
 * chat-minors.ts, written as ONE positive condition so that a missing field can
 * never read as "adult":
 *
 *     adult = dateOfBirth AND dateOfBirthVerifiedAt AND age >= 18
 *
 * Everything else — the three conditions, the lock, the parent line staying
 * lit — is a rendering of that expression, not a decoration around it.
 */
export function ShieldDiagram() {
  const locale = useLocale() as Locale;
  const ar = locale === "ar";

  const ref = useScene(({ q, gsap, DrawSVGPlugin }) => {
    void DrawSVGPlugin;
    const outline = q("[data-shield]");
    const conditions = q("[data-cond]");
    const lock = q("[data-lock]");

    const tl = gsap.timeline({
      scrollTrigger: { trigger: q("[data-root]")[0], start: "top 72%", once: true },
    });

    tl.fromTo(
      outline,
      { drawSVG: "0%" },
      { drawSVG: "100%", duration: 1.2, ease: EASE.play },
    )
      .fromTo(
        conditions,
        { opacity: 0, y: 8 },
        { opacity: 1, y: 0, duration: 0.45, stagger: 0.18, ease: EASE.play },
        "-=0.4",
      )
      .fromTo(lock, { opacity: 0, scale: 0.9 }, { opacity: 1, scale: 1, duration: 0.5 }, "-=0.2");
  });

  const CONDITIONS = ar
    ? ["تاريخ ميلاد مسجّل", "موثّق من جهة معتمدة", "١٨ سنة أو أكتر"]
    : ["A date of birth on file", "Verified, not self-declared", "18 or over"];

  return (
    <div ref={ref} data-root className="mx-auto max-w-lg">
      <svg viewBox="0 0 240 260" className="mx-auto block w-full max-w-[280px]" role="img"
        aria-label={
          ar
            ? "درع يوضّح شروط اعتبار الطالب بالغًا: تاريخ ميلاد موثّق و١٨ سنة أو أكتر."
            : "A shield showing the conditions for counting a student as an adult: a verified date of birth, and 18 or over."
        }
      >
        {/* The shield outline. `pathLength` normalises the stroke so DrawSVG's
            percentages are geometry-independent. */}
        <path
          data-shield
          d="M120 12 L214 46 V132 C214 186 172 226 120 248 C68 226 26 186 26 132 V46 Z"
          className="diagram-stroke"
          strokeWidth={2}
          pathLength={1}
        />
        <g data-lock>
          <rect x="100" y="112" width="40" height="34" rx="6"
            fill="var(--indigo-soft)" stroke="var(--indigo)" strokeWidth={1.5} />
          <path d="M108 112 V102 a12 12 0 0 1 24 0 V112"
            fill="none" stroke="var(--indigo)" strokeWidth={1.5} />
        </g>
      </svg>

      <ul className="mt-8 grid gap-3">
        {CONDITIONS.map((c) => (
          <li
            key={c}
            data-cond
            className="flex items-center gap-3 rounded-[var(--radius-step-md)] border px-4 py-3 text-sm"
            style={{ borderColor: "var(--rule)", backgroundColor: "var(--sheet)", color: "var(--ink)" }}
          >
            <span
              aria-hidden
              className="inline-block h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: "var(--teal)" }}
            />
            {c}
          </li>
        ))}
      </ul>

      <p className="mt-5 text-center text-sm leading-relaxed" style={{ color: "var(--ink-2)" }}>
        {ar
          ? "لو أي شرط ناقص — الطالب قاصر، والحماية شغّالة."
          : "If any one of these is missing, the student is a minor and protection is on."}
      </p>
    </div>
  );
}
