import Link from "next/link";

import { Section, SectionTitle } from "@/components/section";
import type { Locale } from "@/i18n/config";
import type { Messages } from "@/i18n/messages";

// The five questions people ask first; the rest live on /faq.
export function Faq({ t, locale }: { t: Messages; locale: Locale }) {
  const f = t.faq;

  return (
    <Section id="faq">
      <div className="grid gap-10 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-16">
        <div data-reveal="">
          <SectionTitle>{f.title}</SectionTitle>
          <Link href={`/${locale}/faq`} className="btn btn-quiet mt-8">
            {f.more}
          </Link>
        </div>

        <div data-reveal="" className="border-b border-rule">
          {f.items.map((item) => (
            <details key={item.q} className="faq-item border-t border-rule">
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-6 py-4 font-medium text-ink">
                {item.q}
                <svg
                  viewBox="0 0 16 16"
                  aria-hidden="true"
                  className="faq-icon h-4 w-4 shrink-0 text-ink-3 transition-transform duration-200"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                >
                  <path d="M8 3v10M3 8h10" />
                </svg>
              </summary>
              <p className="max-w-[60ch] pb-5 text-[0.9375rem] leading-relaxed text-ink-2">{item.a}</p>
            </details>
          ))}
        </div>
      </div>
    </Section>
  );
}
