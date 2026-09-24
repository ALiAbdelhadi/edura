import { Container } from "@/components/kit/container";
import {
  Chip,
  Eyebrow,
  InitialsTile,
  LedgerButton,
  LedgerEmpty,
  LedgerTable,
  Num,
  Td,
  Th,
  Tr,
} from "@/components/ledger";
import { LanguageSwitcher } from "@/components/ui/language-switcher";
import { LandingShell } from "@/features/landing/landing-shell";
import { MarketingFooter } from "@/features/marketing/marketing-footer";
import styles from "@/features/marketing/marketing.module.css";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/lib/i18n";
import { formatClockRange, formatEGP, formatNumber, formatWeekdayShort } from "@/lib/i18n/format";
import type {
  PublicCourse,
  PublicProfile,
} from "@/lib/services/public-handles/public-profiles";
import {
  Award,
  BookOpen,
  Building2,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
  Star,
  Users,
  type LucideIcon,
} from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { CenterAmenities } from "@/features/public-profile/center-amenities";

// The tenant's public face. Server-rendered, session-less, and the ONLY
// thing a tenant subdomain serves (src/proxy.ts). Every action on it hands
// the visitor to the canonical host: nothing here logs in or pays.

function telHref(phone: string) {
  return `tel:${phone.replace(/[^\d+]/g, "")}`;
}

function waHref(phone: string) {
  const digits = phone.replace(/\D/g, "");
  const intl = digits.startsWith("0") ? `20${digits.slice(1)}` : digits;
  return `https://wa.me/${intl}`;
}

function Stat({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 px-5 py-4">
      <span
        className="flex size-9 shrink-0 items-center justify-center rounded-lg"
        style={{ background: "var(--indigo-soft)", color: "var(--indigo)" }}
      >
        <Icon className="size-4" aria-hidden />
      </span>
      <div className="min-w-0">
        <div className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--ink-3)" }}>
          {label}
        </div>
        <div className="mt-0.5 text-[17px] font-semibold" style={{ color: "var(--ink)" }}>
          <Num>{value}</Num>
        </div>
      </div>
    </div>
  );
}

function ContactRow({
  icon: Icon,
  label,
  value,
  href,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  href?: string;
}) {
  const body = (
    <span className="min-w-0 break-words text-[14px]" style={{ color: "var(--ink)" }} dir="auto">
      {value}
    </span>
  );
  return (
    <div className="flex items-start gap-3 py-3">
      <Icon className="mt-0.5 size-4 shrink-0" style={{ color: "var(--ink-3)" }} aria-hidden />
      <div className="min-w-0">
        <div className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--ink-3)" }}>
          {label}
        </div>
        {href ? (
          <a href={href} className="underline-offset-2 hover:underline" style={{ color: "var(--indigo)" }}>
            {body}
          </a>
        ) : (
          body
        )}
      </div>
    </div>
  );
}

export async function PublicProfileScreen({
  profile,
  locale,
}: {
  profile: PublicProfile;
  locale: Locale;
}) {
  const t = await getTranslations("publicProfile");
  const isCenter = profile.kind === "center";
  const imageUrl = isCenter ? profile.logoUrl : profile.photoUrl;
  const rating = isCenter ? profile.rating : profile.ratingAvg;
  const ratingCount = isCenter ? profile.reviewCount : profile.ratingCount;
  const about = isCenter ? profile.description : profile.bio;
  const phone = isCenter ? profile.phone : null;
  const whatsapp = isCenter ? profile.whatsapp : null;

  const schedule = (c: PublicCourse) => {
    const p = c.schedulePattern;
    if (!p.daysOfWeek.length) return t("tbd");
    const days = p.daysOfWeek.map((d) => formatWeekdayShort(d, locale)).join("، ");
    return `${days} · ${formatClockRange(p.startTime, p.endTime, locale)}`;
  };

  const price = (c: PublicCourse) => {
    if (c.pricePerMonth) return `${formatEGP(c.pricePerMonth, locale, { decimals: false })} ${t("perMonth")}`;
    if (c.pricePerSession)
      return `${formatEGP(c.pricePerSession, locale, { decimals: false })} ${t("perSession")}`;
    return formatEGP(c.price, locale, { decimals: false });
  };

  const place = (c: PublicCourse) => {
    if (c.deliveryMode === "online") return t("online");
    const where = c.centerName ?? c.location ?? (isCenter ? profile.name : t("teacherDirect"));
    return c.deliveryMode === "hybrid" ? `${where} · ${t("hybrid")}` : where;
  };

  return (
    <LandingShell>
      <header className="border-b" style={{ borderColor: "var(--rule)", background: "var(--sheet)" }}>
        <Container className="flex items-center justify-between gap-3 py-3">
          <Link href="/" className="flex items-center gap-2" aria-label={t("openEdura")}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/edura-mark.svg" alt="" width={22} height={22} />
            <span className="text-xs font-semibold" style={{ color: "var(--ink-2)" }}>
              {t("poweredBy")}
            </span>
          </Link>
          <div className="flex items-center gap-2">
            <Suspense fallback={null}>
              <LanguageSwitcher />
            </Suspense>
            <div className="hidden sm:block">
              <LedgerButton asChild variant="primary">
                <Link href="/register">{t("ctaRegister")}</Link>
              </LedgerButton>
            </div>
          </div>
        </Container>
      </header>

      <main>
        <section className="border-b" style={{ borderColor: "var(--rule)" }}>
          <Container className="py-10 sm:py-14">
            <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:gap-8">
              {imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={imageUrl}
                  alt=""
                  width={112}
                  height={112}
                  className="size-24 shrink-0 rounded-2xl border object-cover sm:size-28"
                  style={{ borderColor: "var(--rule)", background: "var(--sheet)" }}
                />
              ) : (
                <div className="shrink-0">
                  <InitialsTile name={profile.name} size={96} tone="indigo" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <Eyebrow>{isCenter ? t("kindCenter") : t("kindTeacher")}</Eyebrow>
                <h1
                  className={`${styles.pageTitle} mt-2 font-extrabold`}
                  style={{ color: "var(--ink)" }}
                >
                  {profile.name}
                </h1>
                {profile.subjects.length ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {profile.subjects.map((s) => (
                      <Chip key={s} tone="indigo">
                        {s}
                      </Chip>
                    ))}
                  </div>
                ) : null}
                <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm" style={{ color: "var(--ink-2)" }}>
                  <span className="inline-flex items-center gap-1.5">
                    <Star className="size-4" style={{ color: "var(--amber)" }} aria-hidden />
                    {rating > 0 ? (
                      <>
                        <Num>{formatNumber(rating, locale)}</Num>
                        <span style={{ color: "var(--ink-3)" }}>
                          · {t("reviews", { count: ratingCount })}
                        </span>
                      </>
                    ) : (
                      t("noRatingYet")
                    )}
                  </span>
                  {!isCenter ? (
                    <span className="inline-flex items-center gap-1.5">
                      <Award className="size-4" aria-hidden style={{ color: "var(--ink-3)" }} />
                      {t("experience", { count: profile.experienceYears })}
                    </span>
                  ) : null}
                  {isCenter && (profile.area || profile.governorate) ? (
                    <span className="inline-flex items-center gap-1.5">
                      <MapPin className="size-4" aria-hidden style={{ color: "var(--ink-3)" }} />
                      {[profile.area, profile.governorate].filter(Boolean).join("، ")}
                    </span>
                  ) : null}
                </div>
                {phone || whatsapp ? (
                  <div className="mt-6 flex flex-wrap gap-2">
                    {whatsapp ? (
                      <LedgerButton asChild variant="primary">
                        <a href={waHref(whatsapp)} target="_blank" rel="noreferrer">
                          <MessageCircle className="size-4" aria-hidden />
                          {t("chatWhatsapp")}
                        </a>
                      </LedgerButton>
                    ) : null}
                    {phone ? (
                      <LedgerButton asChild variant="secondary">
                        <a href={telHref(phone)}>
                          <Phone className="size-4" aria-hidden />
                          {t("call")}
                        </a>
                      </LedgerButton>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>
          </Container>
        </section>

        <section className="border-b" style={{ borderColor: "var(--rule)", background: "var(--sheet)" }}>
          <Container className="py-0">
            <div className="grid grid-cols-1 divide-y sm:grid-cols-3 sm:divide-x sm:divide-y-0 rtl:sm:divide-x-reverse" style={{ borderColor: "var(--rule)" }}>
              <Stat icon={BookOpen} label={t("stats.courses")} value={formatNumber(profile.totalCourses, locale)} />
              <Stat icon={Users} label={t("stats.students")} value={formatNumber(profile.totalStudents, locale)} />
              <Stat
                icon={Star}
                label={t("stats.rating")}
                value={rating > 0 ? `${formatNumber(rating, locale)} / 5` : "—"}
              />
            </div>
          </Container>
        </section>

        <section>
          <Container className="grid gap-10 py-12 lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-14 sm:py-14">
            <div className="min-w-0 space-y-10">
              {about || (!isCenter && profile.qualifications) ? (
                <div>
                  <Eyebrow>{t("about")}</Eyebrow>
                  {about ? (
                    <p
                      className={`${styles.lead} mt-3 max-w-[70ch] whitespace-pre-line`}
                      style={{ color: "var(--ink-2)" }}
                    >
                      {about}
                    </p>
                  ) : null}
                  {!isCenter && profile.qualifications ? (
                    <div className="mt-5">
                      <div className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--ink-3)" }}>
                        {t("qualifications")}
                      </div>
                      <p className="mt-1 max-w-[70ch] text-sm leading-relaxed" style={{ color: "var(--ink)" }}>
                        {profile.qualifications}
                      </p>
                    </div>
                  ) : null}
                </div>
              ) : null}
              {isCenter && profile.amenities.length ? (
                <div>
                  <Eyebrow>{t("amenities")}</Eyebrow>
                  <div className="mt-4">
                    <CenterAmenities amenities={profile.amenities} locale={locale} />
                  </div>
                </div>
              ) : null}

              <div>
                <div className="flex items-baseline justify-between gap-3">
                  <div>
                    <Eyebrow>{t("courses")}</Eyebrow>
                    <p className="mt-1 text-sm" style={{ color: "var(--ink-3)" }}>
                      {t("coursesHint")}
                    </p>
                  </div>
                </div>
                <div className="mt-4 overflow-hidden rounded-xl border" style={{ borderColor: "var(--rule)", background: "var(--sheet)" }}>
                  {profile.courses.length === 0 ? (
                    <LedgerEmpty title={t("noCourses")} />
                  ) : (
                    <LedgerTable
                      head={
                        <>
                          <Th>{t("colCourse")}</Th>
                          <Th>{isCenter ? t("colTeacher") : t("colCenter")}</Th>
                          <Th>{t("colSchedule")}</Th>
                          <Th align="end">{t("colPrice")}</Th>
                          <Th align="end">{t("colSeats")}</Th>
                        </>
                      }
                    >
                      {profile.courses.map((c) => {
                        const left = Math.max(0, c.maxStudents - c.enrolledCount);
                        return (
                          <Tr key={c.id}>
                            <Td className="whitespace-normal">
                              <Link
                                href={`/courses/${c.id}`}
                                className="font-semibold underline-offset-2 hover:underline"
                                style={{ color: "var(--indigo)" }}
                                dir="auto"
                              >
                                {c.title}
                              </Link>
                              <div className="text-xs" style={{ color: "var(--ink-3)" }} dir="auto">
                                {c.subject}
                                {c.gradeTag ? ` · ${c.gradeTag}` : ""}
                              </div>
                            </Td>
                            <Td className="whitespace-normal">
                              <span dir="auto">{isCenter ? c.teacherName || t("tbd") : place(c)}</span>
                            </Td>
                            <Td>
                              <Num>{schedule(c)}</Num>
                            </Td>
                            <Td align="end">
                              <Num>{price(c)}</Num>
                            </Td>
                            <Td align="end">
                              <Chip tone={left === 0 ? "red" : left <= 3 ? "amber" : "teal"}>
                                {t("seatsLeft", { count: left })}
                              </Chip>
                            </Td>
                          </Tr>
                        );
                      })}
                    </LedgerTable>
                  )}
                </div>
              </div>
            </div>

            <aside className="space-y-6">
              {isCenter && (profile.address || profile.phone || profile.whatsapp || profile.email) ? (
                <div className="rounded-xl border p-5" style={{ borderColor: "var(--rule)", background: "var(--sheet)" }}>
                  <Eyebrow>{t("contact")}</Eyebrow>
                  <div className="mt-2 divide-y" style={{ borderColor: "var(--rule)" }}>
                    {profile.address ? (
                      <ContactRow icon={MapPin} label={t("address")} value={profile.address} />
                    ) : null}
                    {profile.phone ? (
                      <ContactRow icon={Phone} label={t("phone")} value={profile.phone} href={telHref(profile.phone)} />
                    ) : null}
                    {profile.whatsapp ? (
                      <ContactRow
                        icon={MessageCircle}
                        label={t("whatsapp")}
                        value={profile.whatsapp}
                        href={waHref(profile.whatsapp)}
                      />
                    ) : null}
                    {profile.email ? (
                      <ContactRow icon={Mail} label={t("email")} value={profile.email} href={`mailto:${profile.email}`} />
                    ) : null}
                  </div>
                </div>
              ) : null}

              <div
                className="rounded-xl border p-5"
                style={{ borderColor: "var(--indigo)", background: "var(--indigo-soft)" }}
              >
                <div className="flex items-center gap-2">
                  <Building2 className="size-4" aria-hidden style={{ color: "var(--indigo)" }} />
                  <h2 className="text-[15px] font-semibold" style={{ color: "var(--ink)" }}>
                    {t("ctaTitle")}
                  </h2>
                </div>
                <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--ink-2)" }}>
                  {isCenter
                    ? t("ctaBodyCenter", { name: profile.name })
                    : t("ctaBodyTeacher", { name: profile.name })}
                </p>
                <div className="mt-4 flex flex-col gap-2">
                  <LedgerButton asChild variant="primary">
                    <Link href="/register">{t("ctaRegister")}</Link>
                  </LedgerButton>
                  <LedgerButton asChild variant="secondary">
                    <Link href="/login">{t("ctaLogin")}</Link>
                  </LedgerButton>
                </div>
              </div>
            </aside>
          </Container>
        </section>
      </main>

      <MarketingFooter />
    </LandingShell>
  );
}
