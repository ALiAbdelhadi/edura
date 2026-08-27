import type { ReactNode } from "react";

import { Eyebrow } from "@repo/ui/components/eyebrow";

import type { Locale } from "@/i18n/config";

export function Section({
  id,
  label,
  locale,
  children,
}: {
  id: string;
  label: string;
  locale: Locale;
  children: ReactNode;
}) {
  return (
    <section id={id} className="border-t border-rule">
      <div className="relative mx-auto w-full max-w-[87.5rem] px-6 py-12 md:px-10 md:py-20 lg:py-28">
        <span
          data-spine=""
          aria-hidden="true"
          className="spine absolute inset-y-0 start-6 hidden w-px bg-rule lg:block"
        />

        <div className="grid gap-10 lg:grid-cols-[9rem_1fr] lg:gap-16">
          <div className="relative lg:sticky lg:top-28 lg:self-start lg:ps-8">
            <span
              data-section-tick=""
              aria-hidden="true"
              className="tick draw-inline absolute top-[0.55rem] start-2 hidden h-px w-4 bg-gold lg:block"
            />
            <Eyebrow locale={locale} tone="gold">
              {label}
            </Eyebrow>
          </div>

          <div className="min-w-0 max-w-[62rem]">{children}</div>
        </div>
      </div>
    </section>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h2 className="display max-w-[22ch] text-[clamp(1.75rem,1.1rem+2.4vw,2.75rem)] leading-[1.25] text-ink">
      {children}
    </h2>
  );
}

export function SectionBody({ children }: { children: ReactNode }) {
  return (
    <p className="mt-5 max-w-[58ch] text-[1.0625rem] leading-[1.75] text-ink-2">{children}</p>
  );
}
