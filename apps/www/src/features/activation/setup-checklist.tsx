"use client";

import { Link } from "@/i18n/navigation";
import { useFormatters } from "@/lib/i18n/use-formatters";
import { track } from "@/lib/track";
import { useCustom } from "@refinedev/core";
import { Check, ChevronLeft, ChevronRight, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useSyncExternalStore } from "react";

/**
 * «خطواتك الأولى» — the center-owner activation checklist.
 *
 * WHAT IS DERIVED AND WHAT IS NOT
 * The five steps' completion comes from the server (real rows, no stored
 * flags — see lib/services/activation/center-checklist.ts). The only local
 * state is whether the owner has DISMISSED the card, and that is deliberately
 * localStorage:
 *
 *   * it is a preference, not a fact about the business;
 *   * storing it would mean a migration on `centers`, a table the money engine
 *     reads, for a nudge widget;
 *   * the honest cost is that dismissing on a phone does not dismiss on a
 *     laptop, which is a smaller problem than a column on a money-adjacent
 *     table.
 *
 * The card renders NOTHING until the fetch resolves, and nothing at all once
 * every step is done AND the owner has dismissed it — a permanent "well done"
 * banner is just chrome.
 */

const DISMISS_KEY = "edura.setupChecklist.dismissed";

/* ── The dismissal store ───────────────────────────────────────────────────
   localStorage is an external store, so it is read through
   `useSyncExternalStore` rather than "read it in an effect and setState" —
   that pattern is a cascading render on every mount and React's lint says so.
   The SERVER snapshot is `true` (dismissed), which is what makes the card
   render nothing during SSR and appear only once the real value is known: the
   alternative flashes a setup checklist at an owner who dismissed it months
   ago. The `storage` event keeps two open tabs in agreement. */
const listeners = new Set<() => void>();

function subscribeDismissed(onChange: () => void) {
  listeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

function readDismissed(): boolean {
  try {
    return window.localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    // Private mode / storage disabled: show the card rather than hide it.
    return false;
  }
}

function writeDismissed() {
  try {
    window.localStorage.setItem(DISMISS_KEY, "1");
  } catch {
    // Nothing to do — the card simply reappears next visit.
  }
  for (const l of listeners) l();
}

const STEP_HREF: Record<string, string> = {
  profile: "/dashboard/admin/settings",
  teacher: "/dashboard/admin/teachers",
  group: "/dashboard/admin/classes",
  student: "/dashboard/admin/students",
  payment: "/dashboard/admin/fees",
};

type ChecklistResponse = {
  steps: { step: string; done: boolean }[];
  done: number;
  total: number;
  complete: boolean;
};

export function SetupChecklist({ className }: { className?: string }) {
  const t = useTranslations("activation");
  const { formatNumber, dir } = useFormatters();
  const Chevron = dir === "rtl" ? ChevronLeft : ChevronRight;

  const dismissed = useSyncExternalStore(subscribeDismissed, readDismissed, () => true);

  const { query, result } = useCustom<ChecklistResponse>({
    url: "dashboards/admin/checklist",
    method: "get",
  });
  const data = result?.data as ChecklistResponse | undefined;

  useEffect(() => {
    if (data && !dismissed) {
      track("onboarding_checklist_viewed", { done: data.done, total: data.total });
    }
  }, [data, dismissed]);

  if (dismissed || query.isLoading || !data) return null;

  function dismiss() {
    writeDismissed();
    track("onboarding_checklist_dismissed", { done: data?.done ?? 0, total: data?.total ?? 0 });
  }

  const pct = data.total > 0 ? Math.round((data.done / data.total) * 100) : 0;

  return (
    <section
      className={`rounded-xl border p-4 sm:p-5 ${className ?? ""}`}
      style={{ borderColor: "var(--rule)", background: "var(--sheet)" }}
      aria-labelledby="setup-checklist-title"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2
            id="setup-checklist-title"
            className="text-[15px] font-bold"
            style={{ color: "var(--ink)" }}
          >
            {data.complete ? t("checklist.allDoneTitle") : t("checklist.title")}
          </h2>
          <p className="mt-1 text-[13px]" style={{ color: "var(--ink-2)" }}>
            {data.complete ? t("checklist.allDoneBody") : t("checklist.subtitle")}
          </p>
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label={t("checklist.dismissLabel")}
          className="inline-flex size-8 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-(--field)"
          style={{ color: "var(--ink-3)" }}
        >
          <X className="size-4" />
        </button>
      </div>

      {/* Progress. The figure is data, so it goes through the mono formatter and
          keeps Latin digits even in Arabic. */}
      <div className="mt-4 flex items-center gap-3">
        <div
          className="h-1.5 flex-1 overflow-hidden rounded-full"
          style={{ background: "var(--field)" }}
          role="progressbar"
          aria-valuenow={data.done}
          aria-valuemin={0}
          aria-valuemax={data.total}
        >
          <div
            className="h-full rounded-full transition-[width] duration-300 motion-reduce:transition-none"
            style={{ width: `${pct}%`, background: "var(--teal)" }}
          />
        </div>
        <span className="shrink-0 text-xs font-medium" style={{ color: "var(--ink-2)" }}>
          {t("checklist.progress", {
            done: formatNumber(data.done),
            total: formatNumber(data.total),
          })}
        </span>
      </div>

      <ol className="mt-4 flex flex-col gap-1.5">
        {data.steps.map(({ step, done }) => {
          const href = STEP_HREF[step];
          const body = (
            <>
              <span
                className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border"
                style={
                  done
                    ? { background: "var(--teal)", borderColor: "var(--teal)", color: "var(--sheet)" }
                    : { borderColor: "var(--rule)", color: "transparent" }
                }
                aria-hidden
              >
                <Check className="size-3" strokeWidth={3} />
              </span>
              <span className="min-w-0 flex-1">
                <span
                  className="block text-[13px] font-semibold"
                  style={{
                    color: done ? "var(--ink-3)" : "var(--ink)",
                    textDecoration: done ? "line-through" : undefined,
                  }}
                >
                  {t(`checklist.steps.${step}.title` as never)}
                </span>
                {!done ? (
                  <span className="block text-xs" style={{ color: "var(--ink-2)" }}>
                    {t(`checklist.steps.${step}.body` as never)}
                  </span>
                ) : null}
              </span>
              {!done ? (
                <Chevron className="mt-0.5 size-4 shrink-0" style={{ color: "var(--indigo)" }} aria-hidden />
              ) : null}
            </>
          );

          return (
            <li key={step}>
              {done || !href ? (
                <div className="flex items-start gap-2.5 rounded-lg px-2 py-2">{body}</div>
              ) : (
                <Link
                  href={href}
                  onClick={() => track("onboarding_checklist_step_clicked", { step })}
                  className="flex items-start gap-2.5 rounded-lg px-2 py-2 transition-colors hover:bg-(--field)"
                >
                  {body}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
