"use client";

import { QRCodeSVG } from "qrcode.react";
import {
  guillochePasses,
  studentIdentity,
  toPath,
} from "@repo/ui/lib/student-identity";
import { EDURA_MARK_PATHS, EDURA_MARK_STROKE, EDURA_MARK_VIEWBOX } from "@repo/ui/lib/edura-mark";
import { formatStudentCode } from "@repo/shared/student-code";
import styles from "./student-id-card.module.css";

const ARABIC = /[؀-ۿ]/;

function CardEyebrow({ children, color }: { children: string; color?: string }) {
  const latin = !ARABIC.test(children);
  return (
    <div
      className={`${styles.eyebrow} ${latin ? styles.eyebrowLatin : ""}`}
      dir={latin ? "ltr" : undefined}
      style={color ? { color } : undefined}
    >
      {children}
    </div>
  );
}

function EduraMark() {
  return (
    <svg
      viewBox={`0 0 ${EDURA_MARK_VIEWBOX} ${EDURA_MARK_VIEWBOX}`}
      aria-hidden="true"
      className="h-[clamp(16px,4.4cqw,34px)] w-[clamp(16px,4.4cqw,34px)] shrink-0"
      style={{ color: "var(--indigo)" }}
    >
      {EDURA_MARK_PATHS.map((p, i) => (
        <path
          key={i}
          d={p.d}
          fill={p.filled ? "currentColor" : "none"}
          stroke={p.filled ? "none" : "currentColor"}
          strokeWidth={p.light ? EDURA_MARK_STROKE.light : EDURA_MARK_STROKE.heavy}
          strokeLinejoin="round"
          strokeLinecap="round"
          opacity={p.light ? 0.8 : 1}
        />
      ))}
    </svg>
  );
}

export const CARD_W = 856;
export const CARD_H = 540;

const TONE_VAR = {
  indigo: "var(--indigo)",
  teal: "var(--teal)",
  amber: "var(--amber)",
} as const;

export type CardLabels = { cardTitle: string; codeLabel: string };

export type StudentIdCardData = {
  name: string;
  studentCode: string;
  educationSystem: { nameAr: string; nameEn: string | null } | null;
  gradeLevel: { nameAr: string; nameEn: string | null } | null;
  track: { nameAr: string; nameEn: string | null } | null;
  patternSeed: string;
  qr: { url: string };
};

export const WORDMARK = "EDURA";

export function StudentIdCard({
  card,
  locale,
  labels,
  className,
}: {
  card: StudentIdCardData;
  locale: string;
  labels: CardLabels;
  className?: string;
}) {
  const identity = studentIdentity(card.patternSeed);
  const accent = TONE_VAR[identity.tone];
  const passes = guillochePasses(identity, CARD_W, CARD_H);
  const ar = locale === "ar";

  const grade =
    (ar ? card.gradeLevel?.nameAr : card.gradeLevel?.nameEn) ??
    card.gradeLevel?.nameAr ??
    null;
  const track =
    (ar ? card.track?.nameAr : card.track?.nameEn) ?? card.track?.nameEn ?? null;
  const system =
    (ar ? card.educationSystem?.nameAr : card.educationSystem?.nameEn) ??
    card.educationSystem?.nameAr ??
    null;

  const micro = ` ${formatStudentCode(card.studentCode)} · `.repeat(28);

  return (
    <div
      className={`led-id-card relative w-full overflow-hidden ${className ?? ""}`}
      style={{
        aspectRatio: `${CARD_W} / ${CARD_H}`,
        background: "var(--sheet)",
        border: "1px solid var(--rule)",
        borderRadius: 14,
        containerType: "inline-size",
      }}
    >
      <svg
        viewBox={`0 0 ${CARD_W} ${CARD_H}`}
        className="absolute inset-0 h-full w-full"
        aria-hidden="true"
        preserveAspectRatio="xMidYMid slice"
        style={{ direction: "ltr" }}
      >

        <g fill="none" strokeLinejoin="round" strokeLinecap="round">
          {passes.map((pass, i) => (
            <path
              key={i}
              d={toPath(pass.points, pass.closed)}
              stroke={TONE_VAR[pass.tone]}
              strokeWidth={pass.width}
              opacity={pass.opacity}
            />
          ))}
        </g>

        <rect
          x={14}
          y={14}
          width={CARD_W - 28}
          height={CARD_H - 28}
          rx={8}
          fill="none"
          stroke="var(--rule)"
          strokeWidth={1}
        />

        <text
          x={22}
          y={CARD_H - 22}
          fontSize={9}
          letterSpacing={1.4}
          fill="var(--ink-3)"
          opacity={0.5}
          fontFamily="var(--ledger-mono), ui-monospace, monospace"
        >
          {micro}
        </text>
      </svg>

      <div className="relative flex h-full flex-col justify-between p-[4.2%]">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-[0.45em]">
              <EduraMark />
              <span
                className={`${styles.eyebrow} ${styles.eyebrowLatin}`}
                dir="ltr"
                style={{ color: "var(--indigo)" }}
              >
                {WORDMARK}
              </span>
              <span className="w-[0.5em]" aria-hidden="true" />
              <CardEyebrow color={accent}>{labels.cardTitle}</CardEyebrow>
            </div>
            <h2
              className="mt-[0.35em] truncate text-[clamp(15px,4.4cqw,30px)] font-bold leading-tight"
              style={{ color: "var(--ink)", letterSpacing: "-0.01em" }}
            >
              {card.name}
            </h2>
            {system ? (
              <p
                className="mt-[0.2em] truncate text-[clamp(9px,2.3cqw,15px)]"
                style={{ color: "var(--ink-2)" }}
              >
                {system}
              </p>
            ) : null}
          </div>

          <div
            className="shrink-0 rounded-[6px] p-[6px]"
            style={{ background: "#ffffff", border: "1px solid var(--rule)" }}
          >

            <QRCodeSVG
              value={card.qr.url}
              size={92}
              level="M"
              bgColor="#ffffff"
              fgColor="#000000"
              className="h-[clamp(46px,13cqw,92px)] w-[clamp(46px,13cqw,92px)]"
            />
          </div>
        </div>

        <div className="flex items-end justify-between gap-4">
          <div className="min-w-0">
            <CardEyebrow>{labels.codeLabel}</CardEyebrow>
            <span
              className={`${styles.figure} block text-[clamp(16px,5.2cqw,36px)] font-semibold leading-none`}
              style={{ color: "var(--ink)", letterSpacing: "0.06em" }}
            >
              {formatStudentCode(card.studentCode)}
            </span>
          </div>

          <div className="min-w-0 text-end">
            {grade ? (
              <p
                className="truncate text-[clamp(10px,2.6cqw,17px)] font-medium"
                style={{ color: "var(--ink)" }}
              >
                {grade}
              </p>
            ) : null}
            {track ? (
              <p
                className="truncate text-[clamp(9px,2.2cqw,14px)]"
                style={{ color: "var(--ink-2)" }}
              >
                {track}
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
