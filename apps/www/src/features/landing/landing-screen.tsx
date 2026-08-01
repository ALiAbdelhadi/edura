import { Container } from "@/components/kit/container";
import { Eyebrow, Num } from "@/components/ledger";
import { LanguageSwitcher } from "@/components/ui/language-switcher";
import { Link } from "@/i18n/navigation";
import { Button } from "@repo/ui/components/button";
import {
  Building2,
  CalendarCheck2,
  GraduationCap,
  HeartHandshake,
  Landmark,
  ShieldCheck,
  UserRound,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { getTranslations } from "next-intl/server";
import Image from "next/image";

export async function LandingScreen() {
  const t = await getTranslations("landing");

  return (
    <div className="min-h-screen bg-(--paper) text-(--ink)">
      <header className="sticky top-0 z-20 border-b border-(--rule) bg-(--sheet)/95 backdrop-blur">
        <Container className="flex items-center justify-between py-3.5">
          <div className="flex items-center gap-2.5">
            <Image src="/edura-mark.svg" alt="" width={30} height={30} priority />
            <span className="text-xl font-bold">Edura</span>
          </div>
          <nav className="flex items-center gap-2">
            <LanguageSwitcher />
            <Button asChild variant="ghost" size="sm">
              <Link href="/login">{t("hero.ctaSecondary")}</Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/register">{t("footer.register")}</Link>
            </Button>
          </nav>
        </Container>
      </header>
      <section>
        <Container className="pb-16 pt-16 text-center sm:pt-24">
          <div className="flex justify-center">
            <Eyebrow>{t("hero.eyebrow")}</Eyebrow>
          </div>
          <h1 className="mx-auto mt-4 max-w-3xl text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl sm:leading-[1.2]">
            {t("hero.title")}
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base leading-8 text-(--ink-2) sm:text-lg">
            {t("hero.subtitle")}
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Button asChild size="lg" className="px-7">
              <Link href="/register">{t("hero.ctaPrimary")}</Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="px-7">
              <Link href="/login">{t("hero.ctaSecondary")}</Link>
            </Button>
          </div>
          <p className="mt-4 text-xs text-[var(--ink-3)]">{t("hero.note")}</p>
        </Container>
      </section>
      <section className="border-y border-[var(--rule)] bg-[var(--sheet)]">
        <Container className="py-16">
          <SectionHead eyebrow={t("roles.eyebrow")} title={t("roles.title")} />
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <RoleCard
              icon={Building2}
              tone="indigo"
              name={t("roles.center.name")}
              bullets={[
                t("roles.center.b1"),
                t("roles.center.b2"),
                t("roles.center.b3"),
                t("roles.center.b4"),
              ]}
            />
            <RoleCard
              icon={GraduationCap}
              tone="teal"
              name={t("roles.teacher.name")}
              bullets={[
                t("roles.teacher.b1"),
                t("roles.teacher.b2"),
                t("roles.teacher.b3"),
                t("roles.teacher.b4"),
              ]}
            />
            <RoleCard
              icon={HeartHandshake}
              tone="amber"
              name={t("roles.parent.name")}
              bullets={[
                t("roles.parent.b1"),
                t("roles.parent.b2"),
                t("roles.parent.b3"),
                t("roles.parent.b4"),
              ]}
            />
            <RoleCard
              icon={UserRound}
              tone="indigo"
              name={t("roles.student.name")}
              bullets={[
                t("roles.student.b1"),
                t("roles.student.b2"),
                t("roles.student.b3"),
                t("roles.student.b4"),
              ]}
            />
          </div>
        </Container>
      </section>
      <section>
        <Container className="py-16">
          <SectionHead eyebrow={t("how.eyebrow")} title={t("how.title")} />
          <div className="mt-10 grid gap-4 sm:grid-cols-3">
            {[
              { n: "١", icon: Users, title: t("how.s1title"), body: t("how.s1body") },
              { n: "٢", icon: CalendarCheck2, title: t("how.s2title"), body: t("how.s2body") },
              { n: "٣", icon: Wallet, title: t("how.s3title"), body: t("how.s3body") },
            ].map((s, i) => (
              <div
                key={i}
                className="rounded-md border border-(--rule) bg-(--sheet) p-6"
                style={{ boxShadow: "var(--lift)" }}
              >
                <div className="flex items-start justify-between">
                  <div className="flex size-10 items-center justify-center rounded-md bg-(--indigo-soft) text-(--indigo)">
                    <s.icon className="size-5" />
                  </div>
                  <div className="text-3xl font-light text-(--ink-3) opacity-50"><Num>{s.n}</Num></div>
                </div>
                <h3 className="mt-4 font-semibold">{s.title}</h3>
                <p className="mt-2 text-sm leading-7 text-(--ink-2)">{s.body}</p>
              </div>
            ))}
          </div>
        </Container>
      </section>
      <section className="border-y border-[var(--rule)] bg-[var(--sheet)]">
        <Container className="grid gap-10 py-16 lg:grid-cols-2">
          <FeatureBand
            icon={Landmark}
            iconClass="bg-(--teal-soft) text-(--teal)"
            eyebrow={t("money.eyebrow")}
            title={t("money.title")}
            bullets={[t("money.b1"), t("money.b2"), t("money.b3"), t("money.b4")]}
            markClass="text-(--teal)"
          />
          <FeatureBand
            icon={ShieldCheck}
            iconClass="bg-(--amber-soft) text-(--amber)"
            eyebrow={t("safety.eyebrow")}
            title={t("safety.title")}
            bullets={[t("safety.b1"), t("safety.b2"), t("safety.b3"), t("safety.b4")]}
            markClass="text-(--amber)"
          />
        </Container>
      </section>
      <section>
        <Container className="py-16">
          <div className="rounded-[var(--radius)] bg-[var(--indigo)] px-6 py-12 text-center text-[var(--indigo-ink)]">
            <h2 className="text-2xl font-bold sm:text-3xl">{t("cta.title")}</h2>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-7 opacity-90">{t("cta.body")}</p>
            <Button asChild size="lg" variant="secondary" className="mt-6 px-8">
              <Link href="/register">{t("cta.button")}</Link>
            </Button>
          </div>
        </Container>
      </section>
      <footer className="border-t border-[var(--rule)] bg-[var(--sheet)]">
        <Container className="flex flex-col items-center gap-5 py-10 sm:flex-row sm:justify-between">
          <div className="flex items-center gap-2.5">
            <Image src="/edura-mark.svg" alt="" width={24} height={24} />
            <div>
              <div className="text-sm font-bold">Edura</div>
              <div className="text-xs text-(--ink-3)">{t("footer.tagline")}</div>
            </div>
          </div>
          <nav className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm text-(--ink-2)">
            <Link href="/login" className="hover:text-(--indigo)">
              {t("footer.login")}
            </Link>
            <Link href="/register" className="hover:text-(--indigo)">
              {t("footer.register")}
            </Link>
            <Link href="/terms" className="hover:text-(--indigo)">
              {t("footer.terms")}
            </Link>
            <Link href="/privacy" className="hover:text-(--indigo)">
              {t("footer.privacy")}
            </Link>
          </nav>
          <div className="text-xs text-[var(--ink-3)]">© {new Date().getFullYear()} Edura</div>
        </Container>
      </footer>
    </div>
  );
}

function SectionHead({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div className="text-center">
      <div className="flex justify-center">
        <Eyebrow>{eyebrow}</Eyebrow>
      </div>
      <h2 className="mt-3 text-2xl font-bold sm:text-3xl">{title}</h2>
    </div>
  );
}

const ROLE_TONES = {
  indigo: "bg-(--indigo-soft) text-(--indigo)",
  teal: "bg-(--teal-soft) text-(--teal)",
  amber: "bg-(--amber-soft) text-(--amber)",
} as const;

function RoleCard({
  icon: Icon,
  tone,
  name,
  bullets,
}: {
  icon: LucideIcon;
  tone: keyof typeof ROLE_TONES;
  name: string;
  bullets: string[];
}) {
  return (
    <div className="flex flex-col rounded-md border border-(--rule) bg-(--paper) p-5" style={{ boxShadow: "var(--lift)" }}>
      <div className={`flex size-10 items-center justify-center rounded-md ${ROLE_TONES[tone]}`}>
        <Icon className="size-5" />
      </div>
      <h3 className="mt-3 font-bold">{name}</h3>
      <ul className="mt-3 space-y-2">
        {bullets.map((b, i) => (
          <li key={i} className="flex gap-2 text-[13px] leading-6 text-(--ink-2)">
            <span className="mt-2.5 size-1 shrink-0 rounded-full bg-(--ink-3)" />
            {b}
          </li>
        ))}
      </ul>
    </div>
  );
}

function FeatureBand({
  icon: Icon,
  iconClass,
  eyebrow,
  title,
  bullets,
  markClass,
}: {
  icon: LucideIcon;
  iconClass: string;
  eyebrow: string;
  title: string;
  bullets: string[];
  markClass: string;
}) {
  return (
    <div>
      <div className={`flex size-11 items-center justify-center rounded-md ${iconClass}`}>
        <Icon className="size-5.5" />
      </div>
      <div className="mt-4">
        <Eyebrow>{eyebrow}</Eyebrow>
      </div>
      <h2 className="mt-2 text-xl font-bold sm:text-2xl">{title}</h2>
      <ul className="mt-4 space-y-2.5">
        {bullets.map((b, i) => (
          <li key={i} className="flex gap-2.5 text-sm leading-7 text-(--ink-2)">
            <span className={`mt-3 size-1.5 shrink-0 rounded-full bg-current ${markClass}`} />
            {b}
          </li>
        ))}
      </ul>
    </div>
  );
}
