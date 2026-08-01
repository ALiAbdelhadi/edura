import { Container } from "@/components/kit/container";
import { Eyebrow } from "@/components/ledger";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/lib/i18n";
import { BookOpen, HelpCircle } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { ContactForm, type ContactLabels } from "./contact-form";
import { DemoCta } from "./demo-cta";
import { MarketingShell } from "./marketing-shell";
import styles from "./marketing.module.css";
import { demoBookingUrl } from "./nav";

export async function ContactScreen({ locale }: { locale: Locale }) {
  const t = await getTranslations("marketing");
  const demoUrl = demoBookingUrl();

  // Resolved on the server and handed over as one object — see the note in
  // contact-form.tsx on why the namespace never crosses the wire.
  const labels: ContactLabels = {
    name: t("contact.form.name"),
    namePlaceholder: t("contact.form.namePlaceholder"),
    email: t("contact.form.email"),
    emailPlaceholder: t("contact.form.emailPlaceholder"),
    phone: t("contact.form.phone"),
    phonePlaceholder: t("contact.form.phonePlaceholder"),
    phoneOptional: t("contact.form.phoneOptional"),
    subject: t("contact.form.subject"),
    subjectDemo: t("contact.form.subjectDemo"),
    subjectPricing: t("contact.form.subjectPricing"),
    subjectSupport: t("contact.form.subjectSupport"),
    subjectPartnership: t("contact.form.subjectPartnership"),
    subjectOther: t("contact.form.subjectOther"),
    message: t("contact.form.message"),
    messagePlaceholder: t("contact.form.messagePlaceholder"),
    submit: t("contact.form.submit"),
    submitting: t("contact.form.submitting"),
    successTitle: t("contact.form.successTitle"),
    successBody: t("contact.form.successBody"),
    sendAnother: t("contact.form.sendAnother"),
    errorTitle: t("contact.form.errorTitle"),
    errorGeneric: t("contact.form.errorGeneric"),
    errorRateLimited: t("contact.form.errorRateLimited"),
    errorValidation: t("contact.form.errorValidation"),
    required: t("contact.form.required"),
  };

  return (
    <MarketingShell active="/contact">
      <section className="border-b" style={{ borderColor: "var(--rule)" }}>
        <Container className="py-12 sm:py-14">
          <div className="max-w-2xl">
            <Eyebrow>{t("contact.hero.eyebrow")}</Eyebrow>
            <h1 className={`${styles.pageTitle} mt-3 font-extrabold`} style={{ color: "var(--ink)" }}>
              {t("contact.hero.title")}
            </h1>
            <p className={`${styles.lead} mt-4`} style={{ color: "var(--ink-2)" }}>
              {t("contact.hero.subtitle")}
            </p>
          </div>
        </Container>
      </section>

      <Container className="py-12 sm:py-14">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:gap-12">
          <ContactForm labels={labels} locale={locale} />

          <aside className="flex flex-col gap-4">
            {demoUrl ? (
              <div className={styles.card}>
                <h2 className="text-[15px] font-bold" style={{ color: "var(--ink)" }}>
                  {t("contact.demo.title")}
                </h2>
                <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--ink-2)" }}>
                  {t("contact.demo.body")}
                </p>
                <div className="mt-4">
                  <DemoCta
                    url={demoUrl}
                    label={t("contact.demo.cta")}
                    placement="contact"
                    variant="primary"
                    withIcon
                  />
                </div>
              </div>
            ) : null}

            <div className={styles.cardMuted}>
              <h2 className="text-[15px] font-bold" style={{ color: "var(--ink)" }}>
                {t("contact.other.title")}
              </h2>
              <ul className="mt-3 flex flex-col gap-3">
                <li>
                  <Link href="/help" className="flex items-start gap-3 group">
                    <BookOpen
                      className="mt-0.5 size-4 shrink-0"
                      style={{ color: "var(--indigo)" }}
                      aria-hidden
                    />
                    <span>
                      <span
                        className="block text-sm font-semibold transition-colors group-hover:text-(--indigo)"
                        style={{ color: "var(--ink)" }}
                      >
                        {t("contact.other.helpTitle")}
                      </span>
                      <span className="block text-xs" style={{ color: "var(--ink-2)" }}>
                        {t("contact.other.helpBody")}
                      </span>
                    </span>
                  </Link>
                </li>
                <li>
                  <Link href="/faq" className="flex items-start gap-3 group">
                    <HelpCircle
                      className="mt-0.5 size-4 shrink-0"
                      style={{ color: "var(--indigo)" }}
                      aria-hidden
                    />
                    <span>
                      <span
                        className="block text-sm font-semibold transition-colors group-hover:text-(--indigo)"
                        style={{ color: "var(--ink)" }}
                      >
                        {t("contact.other.faqTitle")}
                      </span>
                      <span className="block text-xs" style={{ color: "var(--ink-2)" }}>
                        {t("contact.other.faqBody")}
                      </span>
                    </span>
                  </Link>
                </li>
              </ul>
            </div>
          </aside>
        </div>
      </Container>
    </MarketingShell>
  );
}
