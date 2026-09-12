"use client";

import { useTranslations } from "next-intl";
import { CalendarDays, Clock3, Monitor } from "lucide-react";
import { Chip, LedgerButton, Sheet } from "@/features/student/ledger";

export type DeliveryChoice = "any" | "onsite" | "online" | "hybrid";
export type TimeChoice = "" | "morning" | "afternoon" | "evening";

export type DiscoveryFilters = {
  days: number[];
  timeBucket: TimeChoice;
  mode: DeliveryChoice;
};

export const EMPTY_DISCOVERY_FILTERS: DiscoveryFilters = {
  days: [],
  timeBucket: "",
  mode: "any",
};

export function isFiltered(f: DiscoveryFilters) {
  return f.days.length > 0 || f.timeBucket !== "" || f.mode !== "any";
}

// The query-string arms every discovery caller sends. One place, so the courses
// search and the teacher-by-day search can never drift into asking for
// different things while the same chips are lit.
export function discoveryQueryFilters(f: DiscoveryFilters) {
  return [
    ...(f.days.length > 0
      ? [{ field: "daysOfWeek", operator: "eq" as const, value: [...f.days].sort().join(",") }]
      : []),
    ...(f.timeBucket
      ? [{ field: "timeBucket", operator: "eq" as const, value: f.timeBucket }]
      : []),
    ...(f.mode !== "any"
      ? [{ field: "deliveryMode", operator: "eq" as const, value: f.mode }]
      : []),
  ];
}

export function useDayNames() {
  const t = useTranslations();
  return [
    t("studentBrowse.sun"),
    t("studentBrowse.mon"),
    t("studentBrowse.tue"),
    t("studentBrowse.wed"),
    t("studentBrowse.thu"),
    t("studentBrowse.fri"),
    t("studentBrowse.sat"),
  ];
}

export function DeliveryChip({ mode }: { mode: string | null | undefined }) {
  const t = useTranslations();
  if (mode === "online") return <Chip tone="teal">{t("shared.delivery.online")}</Chip>;
  if (mode === "hybrid") return <Chip tone="amber">{t("shared.delivery.hybrid")}</Chip>;
  return <Chip>{t("shared.delivery.onsite")}</Chip>;
}

function Row({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span
        className="inline-flex min-w-28 items-center gap-1.5 text-xs"
        style={{ color: "var(--ink-3)" }}
      >
        {icon}
        {label}
      </span>
      <div className="flex flex-wrap items-center gap-1.5">{children}</div>
    </div>
  );
}

export function DiscoveryFilterBar({
  value,
  onChange,
}: {
  value: DiscoveryFilters;
  onChange: (next: DiscoveryFilters) => void;
}) {
  const t = useTranslations();
  const dayNames = useDayNames();

  const toggleDay = (day: number) =>
    onChange({
      ...value,
      days: value.days.includes(day)
        ? value.days.filter((d) => d !== day)
        : [...value.days, day].sort(),
    });

  const times: { key: TimeChoice; label: string }[] = [
    { key: "", label: t("studentDiscovery.anyTime") },
    { key: "morning", label: t("studentDiscovery.morning") },
    { key: "afternoon", label: t("studentDiscovery.afternoon") },
    { key: "evening", label: t("studentDiscovery.evening") },
  ];

  const modes: { key: DeliveryChoice; label: string }[] = [
    { key: "any", label: t("studentDiscovery.modeAny") },
    { key: "onsite", label: t("shared.delivery.onsite") },
    { key: "online", label: t("shared.delivery.online") },
    { key: "hybrid", label: t("shared.delivery.hybrid") },
  ];

  return (
    <Sheet className="space-y-3 p-4">
      <Row icon={<CalendarDays className="size-3.5" aria-hidden />} label={t("studentDiscovery.days")}>
        {dayNames.map((name, day) => {
          const on = value.days.includes(day);
          return (
            <LedgerButton
              key={day}
              type="button"
              variant={on ? "primary" : "secondary"}
              aria-pressed={on}
              className="px-3 py-1.5 text-xs"
              onClick={() => toggleDay(day)}
            >
              {name}
            </LedgerButton>
          );
        })}
        {value.days.length > 0 ? (
          <LedgerButton
            type="button"
            className="px-3 py-1.5 text-xs"
            onClick={() => onChange({ ...value, days: [] })}
          >
            {t("studentDiscovery.anyDay")}
          </LedgerButton>
        ) : null}
      </Row>

      <Row icon={<Clock3 className="size-3.5" aria-hidden />} label={t("studentDiscovery.time")}>
        {times.map((opt) => (
          <LedgerButton
            key={opt.key || "any"}
            type="button"
            variant={value.timeBucket === opt.key ? "primary" : "secondary"}
            aria-pressed={value.timeBucket === opt.key}
            className="px-3 py-1.5 text-xs"
            onClick={() => onChange({ ...value, timeBucket: opt.key })}
          >
            {opt.label}
          </LedgerButton>
        ))}
      </Row>

      <Row icon={<Monitor className="size-3.5" aria-hidden />} label={t("studentDiscovery.mode")}>
        {modes.map((opt) => (
          <LedgerButton
            key={opt.key}
            type="button"
            variant={value.mode === opt.key ? "primary" : "secondary"}
            aria-pressed={value.mode === opt.key}
            className="px-3 py-1.5 text-xs"
            onClick={() => onChange({ ...value, mode: opt.key })}
          >
            {opt.label}
          </LedgerButton>
        ))}
      </Row>

      {isFiltered(value) ? (
        <div className="flex justify-end">
          <LedgerButton
            type="button"
            className="px-3 py-1.5 text-xs"
            onClick={() => onChange(EMPTY_DISCOVERY_FILTERS)}
          >
            {t("studentDiscovery.clear")}
          </LedgerButton>
        </div>
      ) : null}
    </Sheet>
  );
}
