"use client";

import { useScene } from "@/lib/motion/use-scene";
import { EASE } from "@/lib/motion/runtime";
import { useLocale } from "next-intl";
import type { Locale } from "@/lib/i18n";

/**
 * The settlement split, drawn as the computation it actually is.
 *
 * WHY THIS IS A DIAGRAM AND NOT A SCREENSHOT
 * ----------------------------------------------------------------------------
 * The split is the product's central claim and it has no single screen: it
 * happens inside `distributeSessionRevenue` (packages/server-core/src/services/
 * finance/distribution.ts) and surfaces afterwards as three separate ledger
 * rows in three different portals. A screenshot can show the RESULT; only a
 * drawing can show the derivation — which is exactly the case D-044 admits
 * motion for. The strokes draw in the order the money moves, so the animation
 * IS the explanation rather than an entrance for it.
 *
 * EVERY NUMBER HERE IS COMPUTED, NOT WRITTEN
 * ----------------------------------------------------------------------------
 * The shares below come from `computeLessonSplit`'s actual expression:
 *
 *     teacherNet = price − platformFee − centerShare
 *     centerNet  = centerShare − platformCenterFee
 *     platformNet = platformFee + platformCenterFee
 *
 * with `platformCenterFee = 0` in the room-based branch, which is what
 * distribution.ts passes. Re-deriving it here rather than hard-coding three
 * pretty numbers means the diagram cannot drift from the engine without the
 * arithmetic visibly failing to add up.
 *
 * The rate is an INPUT the caller supplies, and the component states that it is
 * illustrative. The platform publishes no public rate (see the feature matrix
 * §3), so a fixed percentage baked in here would be an invented claim.
 */

type Props = {
  /** Lesson price in piasters. */
  price: number;
  /** Platform's cut, basis points of the price. */
  platformBp: number;
  /** Center's cut, basis points of the price. */
  centerBp: number;
};

const fmt = (piasters: number, locale: Locale) =>
  new Intl.NumberFormat(locale === "ar" ? "ar-EG-u-nu-latn" : "en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(piasters / 100);

export function SettlementDiagram({ price, platformBp, centerBp }: Props) {
  const locale = useLocale() as Locale;

  // The engine's own arithmetic, not a restatement of its output.
  const platformNet = Math.round((price * platformBp) / 10_000);
  const centerShare = Math.round((price * centerBp) / 10_000);
  const teacherNet = price - platformNet - centerShare;

  const L = locale === "ar";
  const t = {
    price: L ? "سعر الحصة" : "Lesson price",
    teacher: L ? "المدرّس" : "Teacher",
    center: L ? "السنتر" : "Center",
    platform: L ? "المنصة" : "Platform",
    note: L
      ? "النسب هنا للتوضيح — كل سنتر له اتفاقه."
      : "Rates shown are illustrative — each center has its own agreement.",
    total: L ? "الإجمالي" : "Total",
  };

  const rows = [
    {
      key: "teacher",
      label: t.teacher,
      value: teacherNet,
      tone: "var(--teal)",
    },
    {
      key: "center",
      label: t.center,
      value: centerShare,
      tone: "var(--indigo)",
    },
    {
      key: "platform",
      label: t.platform,
      value: platformNet,
      tone: "var(--ink-3)",
    },
  ];

  const ref = useScene(({ q, root, gsap }) => {
    // DrawSVG is registered once in runtime.ts; `drawSVG` below is its property.
    const tl = gsap.timeline({
      defaults: { ease: EASE.play },
      scrollTrigger: { trigger: root, start: "top 70%", once: true },
    });

    // The trunk draws first — the money exists before it is divided.
    tl.fromTo(
      q("[data-trunk]"),
      { drawSVG: "0%" },
      { drawSVG: "100%", duration: 0.5 },
    )
      // Then each branch, in the order distribution.ts computes them.
      .fromTo(
        q("[data-branch]"),
        { drawSVG: "0%" },
        { drawSVG: "100%", duration: 0.45, stagger: 0.18 },
        "-=0.1",
      )
      // Figures land with their branch, not before it — a number that appears
      // before its line has been drawn is asserting, not deriving.
      .fromTo(
        q("[data-figure]"),
        { opacity: 0, y: 6 },
        { opacity: 1, y: 0, duration: 0.35, stagger: 0.18 },
        "-=0.75",
      );
  });

  return (
    <figure ref={ref} className="m-0">
      <div
        className="p-6 sm:p-8"
        style={{
          backgroundColor: "var(--sheet)",
          border: "1px solid var(--rule)",
          borderRadius: "var(--radius-step-lg)",
        }}
      >
        {/* The source figure. Mono + tabular, like every figure in the product. */}
        <div className="flex items-baseline justify-between">
          <span className="text-[13px]" style={{ color: "var(--ink-2)" }}>
            {t.price}
          </span>
          <span
            className="font-mono text-lg tabular-nums"
            style={{ color: "var(--ink)" }}
          >
            {fmt(price, locale)}
          </span>
        </div>

        {/* The fork. `dir` sits on the wrapper because React's SVG typings do
            not carry it.

            THIS DIAGRAM DOES MIRROR, and that is not a contradiction of
            CONSTITUTION.md §6.4. The rule there protects a TIME axis, because a
            series is read as a shape and mirroring inverts the meaning of
            "rising". These branches are CATEGORIES, and each one has to land
            above its own label in the row below — which follows reading
            direction. Left unmirrored, the Arabic page drew the teacher's
            branch on the left while the teacher's figure sat on the right. */}
        <div dir="ltr" className="mt-4">
          <svg
            viewBox="0 0 320 96"
            className="w-full"
            role="presentation"
            style={{ height: 96 }}
          >
            <path data-trunk className="diagram-stroke" d="M160 0 L160 30" />
            {rows.map((r, i) => {
              // Column centres, in the same order the <dl> below lays out.
              const lanes = L ? [280, 160, 40] : [40, 160, 280];
              const x = lanes[i]!;
              const RADIUS = 12;
              const d =
                x === 160
                  ? // The middle branch continues straight down; giving it a
                    // curve was what made the junction cross itself.
                    "M160 30 L160 82"
                  : `M160 30 H${x + (x < 160 ? RADIUS : -RADIUS)} Q${x} 30 ${x} ${30 + RADIUS} L${x} 82`;
              return (
                <path
                  key={r.key}
                  data-branch
                  className="diagram-stroke"
                  d={d}
                  style={{ stroke: r.tone }}
                />
              );
            })}
          </svg>
        </div>

        <dl className="mt-2 grid grid-cols-3 gap-3">
          {rows.map((r) => (
            <div key={r.key} data-figure className="text-center">
              <dt className="text-[12px]" style={{ color: "var(--ink-2)" }}>
                {r.label}
              </dt>
              <dd
                className="mt-1 font-mono text-[15px] tabular-nums"
                style={{ color: r.tone }}
              >
                {fmt(r.value, locale)}
              </dd>
            </div>
          ))}
        </dl>

        {/* The double rule: this line is a conclusion, not another row. The
            total is the PRICE, which is the point — the shares conserve. */}
        <div
          className="mt-5 flex items-baseline justify-between pt-3"
          style={{ borderTop: "3px double var(--ink)" }}
        >
          <span className="text-[13px]" style={{ color: "var(--ink-2)" }}>
            {t.total}
          </span>
          <span
            className="font-mono text-[15px] tabular-nums"
            style={{ color: "var(--ink)" }}
          >
            {fmt(teacherNet + centerShare + platformNet, locale)}
          </span>
        </div>
      </div>

      <figcaption
        className="mt-3 text-[12px]"
        style={{ color: "var(--ink-3)" }}
      >
        {t.note}
      </figcaption>
    </figure>
  );
}
