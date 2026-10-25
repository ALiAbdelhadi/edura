import type { ReactNode } from "react";

/* Calm 48x48 line illustrations, one per school subject, drawn in currentColor. */

const BOOK =
  "M24 12c-4-3-10-3-17-2v26c7-1 13-1 17 2 4-3 10-3 17-2V10c-7-1-13-1-17 2zM24 12v26";

function Mono({
  glyph,
  size = 22,
  y = 25,
}: {
  glyph: string;
  size?: number;
  y?: number;
}) {
  return (
    <>
      <text
        x="24"
        y={y}
        textAnchor="middle"
        dominantBaseline="central"
        fill="currentColor"
        stroke="none"
        fontFamily="var(--ar-display)"
        fontWeight={500}
        fontSize={size}
      >
        {glyph}
      </text>
      <path d="M14 36h20" />
    </>
  );
}

const ART: Record<string, ReactNode> = {
  arabic: <Mono glyph="ض" y={21} />,
  nahw: <Mono glyph="ن" y={21} />,
  sarf: <Mono glyph="ص" y={21} />,
  balagha: <Mono glyph="ب" y={21} />,
  imla: <Mono glyph="ء" size={34} y={18} />,
  english: <Mono glyph="Aa" size={20} />,
  "foreign-lang-1": <Mono glyph="Aa" size={20} />,
  "lang2-french": <Mono glyph="Fr" size={18} />,
  "lang2-german": <Mono glyph="De" size={18} />,
  "lang2-italian": <Mono glyph="It" size={18} />,
  "lang2-spanish": <Mono glyph="Es" size={18} />,

  "adab-nusus": (
    <>
      <path d={BOOK} />
      <path d="M11 19h9M11 25h9M28 19h9M28 25h9" />
    </>
  ),
  arud: (
    <>
      <path d="M6 21h6M25.4 21h6M35.1 21h6" />
      <path d="M15 18.5q3.5 8 7 0" />
      <path d="M6 30h36" />
      <circle cx="9" cy="36" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="18.7" cy="36" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="28.4" cy="36" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="38.1" cy="36" r="1.2" fill="currentColor" stroke="none" />
    </>
  ),
  khatt: (
    <>
      <path d="M33 7l8 8-14 14h-8v-8z" />
      <path d="M23 25l-4 4" />
      <path d="M8 38c4-4 7 1 11-2" />
      <path d="M22 37c4-2 7-1 11 1" />
    </>
  ),

  math: (
    <>
      <path d="M8 39V11l24 28z" />
      <path d="M13 33v-9l8 9z" />
      <path d="M26 12a15 15 0 0 1 14 14" />
      <circle cx="26" cy="27" r="1.5" fill="currentColor" stroke="none" />
    </>
  ),
  "math-advanced": (
    <>
      <path d="M22 9c-3-2-7-1-7 4v22c0 5-4 6-6 4" />
      <path d="M29 39h13" />
      <path d="M29 35c4 0 4-12 8-12s3 12 5 12" />
    </>
  ),
  statistics: (
    <>
      <path d="M9 39V25h6v14" />
      <path d="M21 39V14h6v25" />
      <path d="M33 39V20h6v19" />
      <path d="M6 39h36" />
    </>
  ),

  science: (
    <>
      <path d="M12 8h24" />
      <path d="M14 8v30a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8" />
      <path d="M14 25h20" />
      <circle cx="21" cy="32" r="2.5" />
      <circle cx="28" cy="34" r="1.5" />
    </>
  ),
  physics: (
    <>
      <ellipse cx="24" cy="24" rx="18" ry="7.5" transform="rotate(45 24 24)" />
      <ellipse cx="24" cy="24" rx="18" ry="7.5" transform="rotate(-45 24 24)" />
      <circle cx="24" cy="24" r="1.5" fill="currentColor" stroke="none" />
    </>
  ),
  chemistry: (
    <>
      <path d="M19 8h10" />
      <path d="M21 8v10L10 36c-1.5 2.5 0 4 2 4h24c2 0 3.5-1.5 2-4L27 18V8" />
      <path d="M14 31h20" />
    </>
  ),
  biology: (
    <>
      <path d="M9 39C8 21 19 9 39 9c1 20-10 31-30 30z" />
      <path d="M9 39L33 15" />
      <path d="M16 32v-6M16 32h6M22 26v-6M22 26h6M28 20v-4M28 20h4" />
      <path d="M9 39l-3 3" />
    </>
  ),
  "biology-advanced": (
    <>
      <path d="M16 7c0 10 16 10 16 17s-16 7-16 17" />
      <path d="M32 7c0 10-16 10-16 17s16 7 16 17" />
      <path d="M18.5 13h11M18.5 20h11M18.5 28h11M18.5 35h11" />
    </>
  ),
  geology: (
    <>
      <path d="M6 39L19 13l7 12 5-8 11 22z" />
      <path d="M14 26.5c3-1.5 5 1.5 9 0" />
      <path d="M11 31c4-2 8 2 12 0s9-2 14 0" />
      <path d="M9 36c4-2 8 2 12 0s9-2 19 0" />
    </>
  ),

  "social-studies": (
    <>
      <circle cx="19" cy="28" r="12" />
      <ellipse cx="19" cy="28" rx="5" ry="12" />
      <path d="M7 28h24" />
      <path d="M33 7c-4 0-7 3-7 7 0 5 7 13 7 13s7-8 7-13c0-4-3-7-7-7z" />
      <circle cx="33" cy="14" r="2.5" />
    </>
  ),
  history: (
    <>
      <path d="M10 9h28v5H10z" />
      <path d="M16 14v22M32 14v22M21 15v20M27 15v20" />
      <path d="M12 36h24v5H12z" />
    </>
  ),
  "egyptian-history": (
    <>
      <path d="M8 39L22 15l14 24" />
      <path d="M22 15l4 24" />
      <path d="M6 39h36" />
      <circle cx="36" cy="12" r="4" />
    </>
  ),
  geography: (
    <>
      <circle cx="24" cy="24" r="16" />
      <ellipse cx="24" cy="24" rx="7" ry="16" />
      <path d="M8 24h32M24 8v32" />
      <path d="M11 15c8 4 18 4 26 0M11 33c8-4 18-4 26 0" />
    </>
  ),
  civics: (
    <>
      <path d="M13 8v33" />
      <path d="M9 41h8" />
      <path d="M13 10c6-3 10 3 16 0 3-1.5 6-1 8 0v14c-2-1-5-1.5-8 0-6 3-10-3-16 0" />
    </>
  ),
  economics: (
    <>
      <path d="M8 8v32h34" />
      <path d="M13 33l8-8 6 5 11-14" />
      <path d="M31 16h7v7" />
    </>
  ),

  philosophy: (
    <>
      <circle cx="18" cy="19" r="9" />
      <circle cx="30" cy="19" r="9" />
      <circle cx="24" cy="30" r="9" />
    </>
  ),
  mantiq: (
    <>
      <circle cx="12" cy="30" r="5" />
      <circle cx="36" cy="30" r="5" />
      <circle cx="12" cy="30" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="36" cy="30" r="1.5" fill="currentColor" stroke="none" />
      <path d="M12 25C12 10 36 10 36 25" />
      <path d="M32.5 21.5L36 25l3.5-3.5" />
    </>
  ),
  "psychology-sociology": (
    <>
      <circle cx="14" cy="16" r="5.5" />
      <path d="M6 38c0-8 3-12 8-12s8 4 8 12" />
      <circle cx="34" cy="16" r="5.5" />
      <path d="M26 38c0-8 3-12 8-12s8 4 8 12" />
    </>
  ),

  religion: (
    <>
      <rect x="13" y="7" width="22" height="34" rx="2" />
      <path d="M18 7v34M27 7v11l2.5-2 2.5 2V7M22 26h8M22 31h8" />
    </>
  ),
  "quran-tajweed": (
    <>
      <path d="M24 9c-3-2-8-2-12-1.5v16c4-.5 9-.5 12 1.5 3-2 8-2 12-1.5v-16C32 7 27 7 24 9zM24 9v16" />
      <path d="M10 28h28" />
      <path d="M16 28l16 13M32 28L16 41" />
    </>
  ),
  tafsir: (
    <>
      <path d="M17 9c-3-2-7-2-11-1.5v15c4-.5 8-.5 11 1.5 3-2 7-2 11-1.5v-15C24 7 20 7 17 9zM17 9v15" />
      <circle cx="30" cy="32" r="6.5" />
      <path d="M34.7 36.7l5 5" />
    </>
  ),
  hadith: (
    <>
      <rect x="10" y="8" width="28" height="6" rx="3" />
      <rect x="10" y="34" width="28" height="6" rx="3" />
      <path d="M14 14v20M34 14v20" />
      <path d="M19 21h10M19 27h10" />
    </>
  ),
  fiqh: (
    <>
      <circle cx="24" cy="9" r="2" />
      <path d="M24 11v29M16 40h16" />
      <path d="M12 14h24" />
      <path d="M12 14L7 26h10zM36 14l-5 12h10z" />
      <path d="M7 26h10a5 5 0 0 1-10 0zM31 26h10a5 5 0 0 1-10 0z" />
    </>
  ),
  "usul-fiqh": (
    <>
      <circle cx="24" cy="16" r="9" />
      <path d="M24 25v8M24 21l-3-3M24 21l3-3" />
      <path d="M8 33h32" />
      <path d="M24 33v8M24 35c-2 3-6 4-10 4M24 35c2 3 6 4 10 4" />
    </>
  ),
  tawheed: (
    <>
      <rect x="12" y="12" width="24" height="24" />
      <rect x="12" y="12" width="24" height="24" transform="rotate(45 24 24)" />
      <circle cx="24" cy="24" r="1.5" fill="currentColor" stroke="none" />
    </>
  ),
  seerah: (
    <>
      <path d="M23 41c1-8 1-14 2-22" />
      <path d="M25 19c-2-6-8-8-15-6M25 19c2-6 8-8 15-6M25 19V9M25 19c-5 0-9 3-10 8M25 19c5 0 9 3 10 8" />
      <path d="M16 41h16" />
      <circle cx="23.5" cy="22" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="27" cy="22.5" r="1.5" fill="currentColor" stroke="none" />
    </>
  ),

  ict: (
    <>
      <rect x="7" y="8" width="34" height="24" rx="2" />
      <path d="M24 32v6M17 39h14" />
      <circle cx="24" cy="25" r="1.5" fill="currentColor" stroke="none" />
      <path d="M19.8 20.8a6 6 0 0 1 8.4 0M16.2 17.2a11 11 0 0 1 15.6 0" />
    </>
  ),
  computer: (
    <>
      <rect x="11" y="9" width="26" height="19" rx="2" />
      <path d="M6 32h36v2a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2z" />
      <path d="M18 15l4 3-4 3M25 22h5" />
    </>
  ),
  art: (
    <>
      <path d="M19 11C11 11 6 17 6 24c0 9 6 15 14 15 3 0 4-2 3-4-1-2 0-4 3-4h3c3 0 5-2 5-5 0-8-6-15-15-15z" />
      <circle cx="13" cy="22" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="19" cy="17" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="26" cy="19" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="12" cy="30" r="1.5" fill="currentColor" stroke="none" />
      <path d="M38 8v16M36 24h4v5h-4zM36 29c0 4 1 6 2 9 1-3 2-5 2-9" />
    </>
  ),
  pe: (
    <>
      <circle cx="24" cy="24" r="16" />
      <path d="M24 18.5l5.2 3.8-2 6.1h-6.4l-2-6.1z" />
      <path d="M24 18.5V8M29.2 22.3l10-3.2M27.2 28.4l6.2 8.5M20.8 28.4l-6.2 8.5M18.8 22.3l-10-3.2" />
    </>
  ),
  "programming-ai": (
    <>
      <path d="M13 16l-8 8 8 8M35 16l8 8-8 8" />
      <path d="M24 15c1 6 3 8 9 9-6 1-8 3-9 9-1-6-3-8-9-9 6-1 8-3 9-9z" />
    </>
  ),
  multidisciplinary: (
    <>
      <circle cx="20" cy="20" r="12" />
      <path d="M29 29l11 11" />
      <path d="M14 25l5-9 5 9z" />
      <circle cx="25" cy="15" r="1.5" fill="currentColor" stroke="none" />
    </>
  ),
  music: (
    <>
      <path d="M18 34V12l20-4v22M18 18l20-4" />
      <circle cx="14" cy="34" r="4" />
      <circle cx="34" cy="30" r="4" />
    </>
  ),
  psychology: (
    <>
      <path d="M17 41v-9c-3-2-6-6-6-11 0-8 6-13 13-13s13 5 13 12l3 6-3 1v5a3 3 0 0 1-3 3h-4v6" />
      <circle cx="24" cy="20" r="4" />
    </>
  ),
  accounting: (
    <>
      <rect x="12" y="7" width="24" height="34" rx="2" />
      <rect x="16" y="11" width="16" height="7" rx="1" />
      <path d="M18 25h0M24 25h0M30 25h0M18 30.5h0M24 30.5h0M30 30.5h0M18 36h0M24 36h0M30 36h0" strokeWidth={2.5} />
    </>
  ),
  "business-admin": (
    <>
      <rect x="7" y="15" width="34" height="24" rx="2" />
      <path d="M18 15v-4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v4" />
      <path d="M7 26h34M21 26v3h6v-3" />
    </>
  ),
  "islamic-culture": <Mono glyph="ث" y={21} />,
  inshaa: (
    <>
      <path d="M8 13h22M8 20h26M8 27h14" />
      <path d="M26 39l13-13 3 3-13 13h-3z" />
    </>
  ),
  vocational: (
    <>
      <g transform="rotate(45 24 24)">
        <rect x="16" y="7" width="16" height="7" rx="1.5" />
        <path d="M22 14v6M26 14v6M22 28v10a2 2 0 0 0 4 0V28" />
      </g>
      <g transform="rotate(-45 24 24)">
        <path d="M18 8h4v5h4V8h4v6c0 3-2 5-4 6v19a2 2 0 0 1-4 0V20c-2-1-4-3-4-6z" />
      </g>
    </>
  ),
};

// Subjects drawn the same as another: the advanced level of a subject, and
// renamed ones that are still the same thing on the page.
const SAME_AS: Record<string, string> = {
  "integrated-science": "science",
  programming: "computer",
  "islamic-education": "religion",
  "fiqh-hanafi": "fiqh",
  "fiqh-shafii": "fiqh",
  "fiqh-maliki": "fiqh",
  "fiqh-hanbali": "fiqh",
  "chemistry-advanced": "chemistry",
  "physics-advanced": "physics",
  "economics-advanced": "economics",
  "geography-advanced": "geography",
};

const FALLBACK = <path d={BOOK} />;

export function SubjectArt({
  code,
  className,
}: {
  code: string;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 48 48"
      aria-hidden="true"
      focusable="false"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {ART[Object.hasOwn(ART, code) ? code : (SAME_AS[code] ?? "")] ?? FALLBACK}
    </svg>
  );
}
