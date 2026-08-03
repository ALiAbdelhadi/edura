"use client";

import { FlowVideo } from "@/components/media/flow-video";
import { Shot } from "@/components/media/shot";
import { PageHero } from "@/components/scene/page-hero";
import { Scene } from "@/components/scene/scene";
import { SubNav } from "@/components/scene/sub-nav";
import { CapabilityGrid } from "@/components/scene/capability-grid";
import { useLocale, useTranslations } from "next-intl";
import type { Locale } from "@/lib/i18n";

/** /teachers — leads with the recorded register, per the storyboard. */
export function TeachersPage() {
  const t = useTranslations("teachers");
  const locale = useLocale() as Locale;

  const sections = [
    { id: "register", label: t("nav.register") },
    { id: "offline", label: t("nav.offline") },
    { id: "door", label: t("nav.door") },
    { id: "wallet", label: t("nav.wallet") },
    { id: "assistants", label: t("nav.assistants") },
  ];

  return (
    <>
      <PageHero
        eyebrow={t("eyebrow")}
        title={t("title")}
        body={t("body")}
        tone="--teal"
        media={
          <FlowVideo
            flow="teacher-register"
            locale={locale}
            width={620}
            label="/dashboard/teacher/attendance"
            alt={
              locale === "ar"
                ? "المدرّس يفتح كشف الحضور للحصة."
                : "A teacher opens the register for a lesson."
            }
          />
        }
      />

      <SubNav sections={sections} />

      <Scene
        id="register"
        eyebrow={t("register.eyebrow")}
        title={t("register.title")}
        body={t("register.body")}
        media={
          <Shot
            role="teacher"
            screen="classes"
            locale={locale}
            width={620}
            frame="browser"
            label="/dashboard/teacher/classes"
            alt={
              locale === "ar"
                ? "مجموعات المدرّس ومواعيدها"
                : "The teacher's groups and their schedules"
            }
          />
        }
      />

      <Scene
        id="offline"
        eyebrow={t("offline.eyebrow")}
        title={t("offline.title")}
        body={t("offline.body")}
        order="media-first"
        media={
          <Shot
            role="teacher"
            screen="attendance"
            locale={locale}
            width={620}
            frame="browser"
            label="/dashboard/teacher/attendance"
            alt={
              locale === "ar"
                ? "كشف الحضور بحالة كل سجل"
                : "The register, with a commit state per record"
            }
          />
        }
      />

      <Scene
        id="door"
        eyebrow={t("door.eyebrow")}
        title={t("door.title")}
        body={t("door.body")}
        media={
          <Shot
            role="teacher"
            screen="door"
            locale={locale}
            width={620}
            frame="browser"
            label="/dashboard/teacher/door"
            alt={
              locale === "ar"
                ? "تشيك-إن باب القاعة"
                : "Check-in at the classroom door"
            }
          />
        }
      />

      <Scene
        id="wallet"
        eyebrow={t("wallet.eyebrow")}
        title={t("wallet.title")}
        body={t("wallet.body")}
        order="media-first"
        media={
          <Shot
            role="teacher"
            screen="wallet"
            locale={locale}
            width={620}
            frame="browser"
            label="/dashboard/teacher/wallet"
            alt={
              locale === "ar"
                ? "محفظة المدرّس وسجل حركتها"
                : "The teacher's wallet and its history"
            }
          />
        }
      />

      <Scene
        id="assistants"
        eyebrow={t("assistants.eyebrow")}
        title={t("assistants.title")}
        body={t("assistants.body")}
        wide
        media={<CapabilityGrid />}
      />
    </>
  );
}
