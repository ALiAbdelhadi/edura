"use client";

import { useScene } from "@/lib/motion/use-scene";
import { EASE } from "@/lib/motion/runtime";
import { useLocale } from "next-intl";
import type { Locale } from "@/lib/i18n";


type Props = {
  price: number;
  platformBp: number;
  centerBp: number;
};

const fmt = (piasters: number, locale: Locale) =>
  new Intl.NumberFormat(locale === "ar" ? "ar-EG-u-nu-latn" : "en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(piasters / 100);

export function SettlementDiagram({ price, platformBp, centerBp }: Props) {
  const locale = useLocale() as Locale;
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
    const tl = gsap.timeline({
      defaults: { ease: EASE.play },
      scrollTrigger: { trigger: root, start: "top 70%", once: true },
    });

    tl.fromTo(
      q("[data-trunk]"),
      { drawSVG: "0%" },
      { drawSVG: "100%", duration: 0.5 },
    )
      .fromTo(
        q("[data-branch]"),
        { drawSVG: "0%" },
        { drawSVG: "100%", duration: 0.45, stagger: 0.18 },
        "-=0.1",
      )
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
        <div dir="ltr" className="mt-4">
          <svg
            viewBox="0 0 320 96"
            className="w-full"
            role="presentation"
            style={{ height: 96 }}
          >
            <path data-trunk className="diagram-stroke" d="M160 0 L160 30" />
            {rows.map((r, i) => {
              const lanes = L ? [280, 160, 40] : [40, 160, 280];
              const x = lanes[i]!;
              const RADIUS = 12;
              const d =
                x === 160
                  ?
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
