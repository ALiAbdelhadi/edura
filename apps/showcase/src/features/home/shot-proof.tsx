"use client";

import { Container } from "@/components/kit/container";
import { FlowVideo } from "@/components/media/flow-video";
import { SettlementDiagram } from "@/components/media/settlement-diagram";
import { Shot } from "@/components/media/shot";
import type { Locale } from "@/lib/i18n";
import { revealOnScroll } from "@/lib/motion/reveal";
import { useScene } from "@/lib/motion/use-scene";
import { Eyebrow } from "@repo/ui/components/eyebrow";
import { useLocale } from "next-intl";

export function ShotProof() {
  const locale = useLocale() as Locale;

  const ref = useScene(({ q, isRtl, gsap }) => {
    for (const el of q("[data-reveal]")) {
      revealOnScroll(gsap, el, isRtl, { y: 24 });
    }
  });

  return (
    <section ref={ref} className="border-b" style={{ borderColor: "var(--rule)" }}>
      <Container className="py-16 sm:py-24">
        <div data-reveal>
          <Eyebrow locale={locale}>
            {locale === "ar" ? "من داخل المنتج" : "Inside the product"}
          </Eyebrow>
        </div>
        <div data-reveal className="mt-8 grid gap-8 lg:grid-cols-[1.6fr_1fr] lg:items-end">
          <Shot
            role="admin"
            screen="checkin"
            locale={locale}
            width={880}
            frame="browser"
            label="/dashboard/admin/checkin"
            alt={
              locale === "ar"
                ? "شاشة تسجيل الحضور على كاونتر السنتر"
                : "The center's front-desk check-in screen"
            }
          />
          <Shot
            role="student"
            screen="schedule"
            locale={locale}
            width={300}
            frame="phone"
            alt={
              locale === "ar"
                ? "جدول الطالب على الموبايل"
                : "A student's schedule on mobile"
            }
          />
        </div>
        <div data-reveal className="mt-12">
          <FlowVideo
            flow="counter-checkin"
            locale={locale}
            width={880}
            label="/dashboard/staff/checkin"
            alt={
              locale === "ar"
                ? "موظف الاستقبال يكتب كود الطالب ويلاقيه في ثانية."
                : "The front desk types a student code and finds them in seconds."
            }
          />
        </div>
        <div data-reveal className="mt-12 max-w-xl">
          <SettlementDiagram price={30_000} platformBp={1000} centerBp={2500} />
        </div>
      </Container>
    </section>
  );
}
