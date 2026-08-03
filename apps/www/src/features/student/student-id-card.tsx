"use client";

import { QRCodeSVG } from "qrcode.react";
import {
  guillochePasses,
  rosettePath,
  studentIdentity,
} from "@repo/ui/lib/student-identity";
import { EDURA_MARK_PATHS, EDURA_MARK_STROKE, EDURA_MARK_VIEWBOX } from "@repo/ui/lib/edura-mark";
import { formatStudentCode } from "@repo/database/student-code";
import type { StudentCard } from "@repo/server-core/services/students/student-card";
import { Num } from "@/features/student/ledger";
import styles from "./student-id.module.css";

const ARABIC = /[؀-ۿ]/;

/** The eyebrow, at the card's own scale. Mono + tracking for Latin only. */
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

/**
 * The issuer's mark, engraved — the same Edura mark the app uses, in one ink at
 * hairline weight. See @repo/ui/lib/edura-mark for why it is not the gradient
 * tile from /edura-mark.svg, and why it is `--indigo` for every student rather
 * than the per-student accent.
 */
function EduraMark() {
  return (
    <svg
      viewBox={`0 0 ${EDURA_MARK_VIEWBOX} ${EDURA_MARK_VIEWBOX}`}
      aria-hidden="true"
      // Sized in cqw like everything else on the card, so the mark scales with
      // the document rather than shrinking against it on paper.
      className="h-[clamp(16px,4.4cqw,34px)] w-[clamp(16px,4.4cqw,34px)] shrink-0"
      style={{ color: "var(--indigo)" }}
    >
      {EDURA_MARK_PATHS.map((p, i) => (
        <path
          key={i}
          d={p.d}
          fill={p.filled ? "currentColor" : "none"}
          stroke={p.filled ? "none" : "currentColor"}
          // Stroke width is in viewBox units — the SVG scales it for us.
          strokeWidth={p.light ? EDURA_MARK_STROKE.light : EDURA_MARK_STROKE.heavy}
          strokeLinejoin="round"
          strokeLinecap="round"
          opacity={p.light ? 0.8 : 1}
        />
      ))}
    </svg>
  );
}

/* بطاقة الطالب / The student card.
   ══════════════════════════════════════════════════════════════════════════════

   The second thing this product prints (the receipt was the first), and like the
   receipt it is built as a DOCUMENT — something that leaves the app, gets folded
   into a school bag, and is handed across a counter — rather than as a screen
   component that happens to be printable.

   ── Why an engraving and not a gradient ───────────────────────────────────────

   The ask was "a different gradient for every student, so they feel it is theirs".
   The design system forbids gradients on student surfaces, and for a good reason
   (§4 Warmth: fills and tiles, never a new hue). The identity is carried by a
   GUILLOCHÉ instead: the engine-turned rosette that marks a genuine document on
   banknotes and identity cards, drawn from the student's own id, unique to them,
   and costing the palette nothing. See @repo/ui/lib/student-identity.

   ── Two layers, and why they are split ───────────────────────────────────────

   SVG underneath carries the engraving, the frame and the micro-print — pure
   geometry and Latin glyphs, which SVG renders identically everywhere and which
   the PNG exporter can redraw on a canvas from the same numbers.

   HTML on top carries every word. Arabic is a connected script: the name and the
   grade need contextual shaping, the lam-alef ligature and bidi reordering around
   the Latin code, and the browser's own text engine is the only thing in this
   stack that does all three correctly. The same reasoning as receipt-sheet.tsx.

   ── The code is the only identifier on it ────────────────────────────────────

   No phone, no email, no birthday, no address, no money. A card is lost, dropped
   in a corridor and photographed; nearly every student here is a minor. The QR
   holds exactly the eight characters printed beside it — no token, no link — so a
   photograph of this card grants nobody anything.

   ── Print ────────────────────────────────────────────────────────────────────

   The tokens flip in dark mode; a card printed from a dark session must not come
   out as pale ink on nothing. The print rules live with the print route
   (`student-id-print-sheet.tsx`), which pins the paper values and sets
   print-color-adjust so the engraving survives the printer's "background
   graphics" default. */

export const CARD_W = 856;
export const CARD_H = 540;

/* The engraving is drawn in one of the three permitted accents, chosen from the
   seed. This is inside the system, not a bend of it: §4 Warmth says student
   surfaces "may use --indigo-soft, --teal-soft and the initials-tile pattern
   more generously FOR ORIENTATION AND IDENTITY". A card is identity. The accent
   never touches a label or a figure, where colour carries meaning (teal = money,
   amber = waiting) — only the ornament. */
const TONE_VAR = {
  indigo: "var(--indigo)",
  teal: "var(--teal)",
  amber: "var(--amber)",
} as const;

export type CardLabels = { cardTitle: string; codeLabel: string };

/**
 * The issuer, named. An identity document says who issued it in WORDS — the
 * mark alone is a decoration, not an issuer line.
 *
 * "EDURA" is Latin, so it takes the marker rule's Latin treatment (mono,
 * uppercase, tracked) that CONSTITUTION §6 reserves for exactly this; and it is
 * `--indigo`, the brand colour, holding it together with the mark beside it.
 * The wordmark is NOT translated — a brand name is a name, and transliterating
 * it on the Arabic card would make the card and the app disagree about what the
 * product is called.
 */
export const WORDMARK = "EDURA";

/**
 * Labels arrive as PROPS, not from `useTranslations`. The card renders in two
 * message scopes — inside /dashboard, which mounts the full dictionary, and on
 * the print route, which mounts only the base namespaces — and a component that
 * reached for its own translations would work in one and throw in the other.
 * Same reason `ReceiptSheet` takes its labels.
 */
export function StudentIdCard({
  card,
  locale,
  labels,
  className,
}: {
  card: StudentCard;
  locale: string;
  labels: CardLabels;
  className?: string;
}) {
  const identity = studentIdentity(card.patternSeed);
  const accent = TONE_VAR[identity.tone];
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
        // Every size below is in `cqw`, so the card scales as ONE object: at
        // 320px on a phone and at 86mm on paper it is the same card, not the
        // same layout with different type sizes.
        containerType: "inline-size",
      }}
    >
      <svg
        viewBox={`0 0 ${CARD_W} ${CARD_H}`}
        className="absolute inset-0 h-full w-full"
        aria-hidden="true"
        preserveAspectRatio="xMidYMid slice"
        // The card mirrors; its ENGRAVING does not, and neither does the
        // Latin micro-print. Without this the SVG inherits the page's RTL
        // direction and the micro-print lays out right-to-left off the edge.
        style={{ direction: "ltr" }}
      >
        {/* Centred, like the rosette on a share certificate — and centred
            rather than pushed to one edge because this card mirrors: in Arabic
            the text runs from the right, in English from the left, and an
            engraving parked on one side would sit under the name in one of
            them. It is drawn once, deterministically, from the seed. */}
        <g stroke={accent} fill="none" strokeWidth={0.7}>
          {guillochePasses(identity).map((pass, i) => (
            <path
              key={i}
              d={rosettePath(pass.rosette, pass.stroke, CARD_W / 2, CARD_H / 2, 208, identity.rotation)}
              opacity={pass.opacity * 0.55}
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

        {/* Micro-print: the student's own code repeated along the foot of the
            card, small enough to read as a texture rather than a label. A
            security-print device, and one more thing that is unmistakably
            theirs. Overflow is clipped by the card's own rounded box, so the
            band always reaches both edges whatever the code's width. */}
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
            {/* Issuer, then what the document IS — the order every identity
                card uses. They are separated by SPACE, never by a typed
                separator: a "·" between a Latin name and an Arabic phrase
                migrates to the wrong side of the run (CONSTITUTION §6). */}
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

          {/* The QR patch is ALWAYS black on white, in both themes. That is not
              a palette exception, it is what makes it scan: a dark-mode card
              with a dark QR on a dark patch is unreadable to every scanner.
              Same principle as the receipt forcing the paper palette on print. */}
          <div
            className="shrink-0 rounded-[6px] p-[6px]"
            style={{ background: "#ffffff", border: "1px solid var(--rule)" }}
          >
            {/* The payload is the code and nothing else — see the header. */}
            <QRCodeSVG
              value={card.studentCode}
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
            <Num
              className="block text-[clamp(16px,5.2cqw,36px)] font-semibold leading-none"
              style={{ color: "var(--ink)", letterSpacing: "0.06em" }}
            >
              {formatStudentCode(card.studentCode)}
            </Num>
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
