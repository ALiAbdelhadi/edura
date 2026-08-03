"use client";

import { ShieldDiagram } from "@/components/media/shield-diagram";
import { Shot } from "@/components/media/shot";
import { PageHero } from "@/components/scene/page-hero";
import { Scene } from "@/components/scene/scene";
import { SubNav } from "@/components/scene/sub-nav";
import { useLocale, useTranslations } from "next-intl";
import type { Locale } from "@/lib/i18n";

/**
 * /parents — LEADS with child safety, per the storyboard.
 *
 * The ordering is the argument. Monitoring and payments are useful, but a
 * guardian's first question is whether their child is safe, and the honest
 * answer is a rule that is already on rather than a feature they must enable.
 */
export function ParentsPage() {
  const t = useTranslations("parents");
  const locale = useLocale() as Locale;

  const sections = [
    { id: "safety", label: t("nav.safety") },
    { id: "oversight", label: t("nav.oversight") },
    { id: "pay", label: t("nav.pay") },
    { id: "follow", label: t("nav.follow") },
  ];

  return (
    <>
      <PageHero
        eyebrow={t("eyebrow")}
        title={t("title")}
        body={t("body")}
        tone="--red"
        media={<ShieldDiagram />}
      />

      <SubNav sections={sections} />

      <Scene
        id="safety"
        eyebrow={t("safety.eyebrow")}
        title={t("safety.title")}
        body={t("safety.body")}
        wide
      />

      <Scene
        eyebrow={t("narrow.eyebrow")}
        title={t("narrow.title")}
        body={t("narrow.body")}
        order="media-first"
        media={
          <Shot
            role="parent"
            screen="children"
            locale={locale}
            width={620}
            frame="browser"
            label="/dashboard/parent/children"
            alt={
              locale === "ar"
                ? "أبناء ولي الأمر وحالة كل ارتباط"
                : "The guardian's children and the state of each link"
            }
          />
        }
      />

      <Scene
        id="oversight"
        eyebrow={t("oversight.eyebrow")}
        title={t("oversight.title")}
        body={t("oversight.body")}
        media={
          <Shot
            role="parent"
            screen="oversight"
            locale={locale}
            width={620}
            frame="browser"
            label="/dashboard/parent/oversight"
            alt={
              locale === "ar"
                ? "شاشة الإشراف للقراءة فقط"
                : "The read-only oversight screen"
            }
          />
        }
      />

      <Scene
        id="pay"
        eyebrow={t("pay.eyebrow")}
        title={t("pay.title")}
        body={t("pay.body")}
        order="media-first"
        media={
          <Shot
            role="parent"
            screen="pay"
            locale={locale}
            width={620}
            frame="browser"
            label="/dashboard/parent/pay"
            alt={
              locale === "ar"
                ? "دفع حصة لابن مرتبط"
                : "Paying for a linked child's lesson"
            }
          />
        }
      />

      <Scene
        id="follow"
        eyebrow={t("follow.eyebrow")}
        title={t("follow.title")}
        body={t("follow.body")}
        media={
          <div className="mx-auto w-[300px]">
            <Shot
              role="parent"
              screen="attendance"
              locale={locale}
              width={300}
              frame="phone"
              alt={
                locale === "ar"
                  ? "حضور الأبناء على الموبايل"
                  : "Children's attendance on mobile"
              }
            />
          </div>
        }
      />
    </>
  );
}
