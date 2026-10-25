import type { TeacherLook } from "@/i18n/messages";

// A faceless, illustrated bust for the sample teacher cards. No real person is
// drawn and no face is given, so nothing here can be mistaken for a photo of a
// teacher on the platform. Colours come from the `--portrait-*` variables in
// home-b.css; `tone` picks one of three skin tones.
export function TeacherPortrait({
  look,
  tone,
  className,
}: {
  look: TeacherLook;
  tone: 0 | 1 | 2;
  className?: string;
}) {
  const hijab = look === "hijab" || look === "hijab-glasses";
  const glasses = look === "glasses" || look === "hijab-glasses";

  return (
    <svg viewBox="0 0 120 100" aria-hidden="true" focusable="false" className={className} data-tone={tone}>
      <path d="M18 100c0-22 18-34 42-34s42 12 42 34z" fill="var(--portrait-cloth)" />

      {hijab ? (
        <>
          <path
            d="M60 18c-15 0-25 11-25 27 0 11 4 19 9 25l-8 14h48l-8-14c5-6 9-14 9-25 0-16-10-27-25-27z"
            fill="var(--portrait-scarf)"
          />
          <ellipse cx="60" cy="46" rx="13.5" ry="17" fill="var(--portrait-skin)" />
        </>
      ) : (
        <>
          <rect x="52" y="56" width="16" height="14" fill="var(--portrait-skin)" />
          {look === "bun" ? <circle cx="60" cy="17" r="8" fill="var(--portrait-hair)" /> : null}
          <ellipse cx="60" cy="42" rx="17" ry="20" fill="var(--portrait-skin)" />
          <path
            d={
              look === "bun"
                ? "M42 46c-1-16 7-26 18-26s19 10 18 26c-3-9-9-14-18-14s-15 5-18 14z"
                : "M42 40c0-13 8-20 18-20s18 7 18 20c-3-6-9-9-18-9s-15 3-18 9z"
            }
            fill="var(--portrait-hair)"
          />
          {look === "beard" ? (
            <path d="M43 44c1 12 8 18 17 18s16-6 17-18c-4 5-9 7-17 7s-13-2-17-7z" fill="var(--portrait-hair)" />
          ) : null}
        </>
      )}

      {glasses ? (
        <g fill="none" stroke="var(--portrait-line)" strokeWidth="1.6">
          <circle cx="53" cy={hijab ? 45 : 43} r="4.6" />
          <circle cx="67" cy={hijab ? 45 : 43} r="4.6" />
          <path d={hijab ? "M57.6 45h4.8" : "M57.6 43h4.8"} />
        </g>
      ) : null}
    </svg>
  );
}
