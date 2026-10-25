import { Arrow } from "@/components/arrow";
import { Section } from "@/components/section";
import type { Locale } from "@/i18n/config";
import type { Messages } from "@/i18n/messages";
import { appUrl } from "@/lib/app-origin";

// The page's one band.
export function Closing({ t, locale }: { t: Messages; locale: Locale }) {
  const c = t.closing;

  return (
    <Section id="start" tone="band">
      <div data-reveal="" className="max-w-[40rem]">
        <h2 className="t-h2">{c.title}</h2>
        <p className="t-lede mt-5 text-band-ink-2">{c.body}</p>
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <a href={appUrl(locale, "/register?role=student")} className="btn btn-pen">
            {c.primary}
            <Arrow />
          </a>
          <a href={appUrl(locale, "/register?role=parent")} className="btn btn-quiet">
            {c.secondary}
          </a>
        </div>
      </div>
    </Section>
  );
}
