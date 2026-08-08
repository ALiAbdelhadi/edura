import { Container } from "@/components/kit/container";
import { appUrl, registerUrl } from "@/lib/app-links";
import { getTranslations } from "next-intl/server";
import type { Locale } from "@/lib/i18n";

/**
 * The closing panel on every page.
 *
 * Both links leave for apps/www and are therefore plain anchors — the showcase
 * is a separate origin, and a next-intl <Link> would resolve against this app.
 * The secondary link goes to `/pricing`, which is the page that publishes real
 * rates; sending a reader who wants numbers anywhere else would be a detour
 * around the only surface allowed to answer them.
 */
export async function Cta({ locale }: { locale: Locale }) {
  const t = await getTranslations("cta");
  const nav = await getTranslations("nav");

  return (
    <section className="py-20 sm:py-28">
      <Container>
        <div
          className="rounded-[var(--radius-step-xl)] border p-10 text-center sm:p-14"
          style={{ borderColor: "var(--rule)", backgroundColor: "var(--sheet)" }}
        >
          <h2
            className="mx-auto max-w-2xl text-2xl font-extrabold leading-snug sm:text-3xl"
            style={{ color: "var(--ink)" }}
          >
            {t("title")}
          </h2>
          <p
            className="mx-auto mt-4 max-w-xl text-base leading-relaxed"
            style={{ color: "var(--ink-2)" }}
          >
            {t("body")}
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            {/* The site's CTA pair, shared by every role page. Kept identical to
                the nav, hero and footer: one solid ink, one gold stroke. It is
                shared marketing chrome, so leaving the retired indigo fill here
                would have left the site visibly wearing two skins at once. */}
            <a
              href={registerUrl(locale)}
              className="focus-ledger inline-flex h-11 items-center rounded-[var(--radius-step-md)] px-6 text-sm font-medium transition-colors hover:bg-ink-2"
              style={{ backgroundColor: "var(--ink)", color: "var(--paper)" }}
            >
              {nav("register")}
            </a>
            <a
              href={appUrl("/pricing", locale)}
              className="focus-ledger inline-flex h-11 items-center rounded-[var(--radius-step-md)] border px-6 text-sm font-medium transition-colors hover:bg-gold-soft"
              style={{ borderColor: "var(--gold)", color: "var(--gold-deep)" }}
            >
              {nav("pricing")}
            </a>
          </div>
        </div>
      </Container>
    </section>
  );
}
