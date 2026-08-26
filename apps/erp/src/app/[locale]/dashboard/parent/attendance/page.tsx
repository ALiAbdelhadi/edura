"use client";

import React from "react";
import { UsersRound } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@repo/ui/components/button";
import { SkeletonRows } from "@repo/ui/components/ledger";
import { AttendanceScreen } from "@/features/attendance/attendance-screen";
import { ChildTodayLine } from "@/features/parent/child-today-line";
import { ParentRecentAttendance } from "@/features/parent/parent-recent-attendance";
import { useChildSelector } from "@/components/ui/child-selector";
import { EmptyState } from "@/components/kit/empty-state";
import { PageHeader } from "@/components/kit/page-header";
import { Link } from "@/i18n/navigation";

/**
 * A child's attendance record.
 *
 * The screen below is the shared one (four portals mount it), so the heading
 * belongs HERE — the parent's copy has to name the child, and the student's
 * copy has no child to name. It had no heading at all: a parent landed on a
 * donut and three numbers with nothing saying whose they were, and for a
 * single-child parent the old chip bar rendered nothing, so no screen in the
 * portal ever printed the name.
 *
 * The child selector itself is gone from this file — the portal chrome states
 * the context once, above every per-child route.
 *
 * ── THE ORDER, WHICH IS THE POINT OF THIS PAGE ────────────────────────────
 *
 * "النهاردة" · the ratio · the lessons BY NAME · the 28-day heatmap.
 *
 * It used to be the ratio and the heatmap, and both answer "how many". A
 * parent came here to settle one lesson on one date, and neither could be
 * pointed at. The heatmap is not removed — it is a pattern tool and it is good
 * at that — it is simply no longer the only thing under the numbers. Passing
 * the list through `AttendanceScreen`'s own `recent` slot is what puts it
 * between the two, without this portal reaching into a screen four portals
 * share.
 */
export default function Page() {
  const t = useTranslations();
  const { childId, childName, isLoading } = useChildSelector();

  // LOADING IS NOT EMPTY. While `me-children` is in flight there is no
  // `childId` yet, and rendering the empty state on that tells a parent — on a
  // cold load, every time — that their family does not exist, with a button
  // inviting them to link a child they linked months ago. Measured on this
  // screen before the guard: "لا يوجد أبناء مرتبطون بعد" flashed on every hard
  // navigation. Same distinction the pay screen already draws between "we
  // could not load your children" and "you have none".
  if (isLoading) {
    return (
      <div className="flex w-full flex-col gap-4">
        <PageHeader
          eyebrow={t("roles.parent")}
          title={t("parentAttendance.title")}
          description={t("parentAttendance.subtitle")}
        />
        <SkeletonRows rows={4} />
      </div>
    );
  }

  if (!childId) {
    return (
      <div className="flex w-full flex-col gap-4">
        <PageHeader
          eyebrow={t("roles.parent")}
          title={t("parentAttendance.title")}
          description={t("parentAttendance.subtitle")}
        />
        {/* Names the fact AND the next step. "لا يوجد أبناء" on its own tells a
            parent their family does not exist and leaves them there. */}
        <EmptyState
          icon={UsersRound}
          title={t("parentLinking.noLinkedChildren")}
          action={
            <Button asChild>
              <Link href="/dashboard/parent/children">
                {t("parentChild.link")}
              </Link>
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col gap-4">
      <PageHeader
        eyebrow={t("roles.parent")}
        title={
          childName
            ? t("parentAttendance.titleFor", { name: childName })
            : t("parentAttendance.title")
        }
        description={t("parentAttendance.subtitle")}
      />
      {/* Renders nothing on a day with no register — before it is taken there
          is no answer, and an em dash is not one. No `href`: this IS the
          attendance page. */}
      <ChildTodayLine childId={childId} childName={childName} />
      <AttendanceScreen
        studentId={childId}
        recent={<ParentRecentAttendance childId={childId} />}
      />
    </div>
  );
}
