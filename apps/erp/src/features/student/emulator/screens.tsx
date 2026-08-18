"use client";

/**
 * The simulated screens.
 *
 * Built from the REAL Ledger primitives (`@/components/ledger`) rather than
 * look-alike markup, so what the learner practises on is the product's own
 * visual language down to the hairlines and the figure treatment. When the
 * design changes, these change with it.
 *
 * Every interactive control carries a `data-emu` id. That is the only contract
 * between a screen and the engine: the engine highlights `data-emu={target}`
 * and advances when it is clicked. Screens know nothing about steps.
 */

import { useLocale, useTranslations } from "next-intl";
import type { Locale } from "@/lib/i18n";
import { formatPercent } from "@/lib/i18n/format";
import {
  Chip,
  Eyebrow,
  InitialsTile,
  Money,
  Num,
  SectionHeading,
  Sheet,
} from "@/components/ledger";
import {
  EMU_LEDGER_OPENING,
  EMU_RECORD,
  EMU_STUDENT,
  EMU_SUBJECTS,
  EMU_TODAY,
  EMU_WEEK,
  pick,
  type EmuLedgerRow,
} from "./world";
import { EmuTarget } from "./target";

/* ── Dashboard ─────────────────────────────────────────────────────────── */

export function EmuDashboard({ subscribed }: { subscribed: boolean }) {
  const t = useTranslations("studentEmulator");
  const locale = useLocale() as Locale;
  const week = subscribed
    ? [...EMU_WEEK, { id: "new", subject: EMU_SUBJECTS[0]!.name, time: "16:00", day: { ar: "الثلاثاء", en: "Tue" } }]
    : EMU_WEEK;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold" style={{ color: "var(--ink)" }}>
          {t("screens.whatsNext")}
        </h2>
      </div>

      <div data-emu-region="up-next">
        <Sheet className="p-4">
          <Eyebrow>{t("screens.upNext")}</Eyebrow>
          <div className="mt-2 flex items-center gap-3">
            <InitialsTile name={pick(EMU_TODAY[0]!.subject, locale)} size={38} tone="indigo" />
            <div className="min-w-0">
              <p className="truncate font-semibold" style={{ color: "var(--ink)" }}>
                {pick(EMU_TODAY[0]!.subject, locale)}
              </p>
              <p className="text-sm" style={{ color: "var(--ink-2)" }}>
                <Num.ClockText value={EMU_TODAY[0]!.time} locale={locale} /> · {t("screens.today")}
              </p>
            </div>
          </div>
        </Sheet>
      </div>

      <Sheet className="p-4">
        <SectionHeading eyebrow={t("screens.schedule")} title={t("screens.thisWeek")} />
        <ul className="mt-2">
          {week.map((s) => (
            <li
              key={s.id}
              className="flex items-center justify-between gap-3 border-b py-2 last:border-b-0"
              style={{ borderColor: "var(--rule-2)" }}
            >
              <span className="truncate text-sm" style={{ color: "var(--ink)" }}>
                {pick(s.subject, locale)}
              </span>
              <Num style={{ color: "var(--ink-2)", fontSize: 12 }}>
                {s.day ? `${pick(s.day, locale)} · ` : ""}
                <Num.ClockText value={s.time} locale={locale} />
              </Num>
            </li>
          ))}
        </ul>
      </Sheet>

      <div data-emu-region="record" className="grid grid-cols-2 gap-3">
        <Sheet className="p-4">
          <Eyebrow>{t("screens.record")}</Eyebrow>
          <p className="mt-1 text-sm" style={{ color: "var(--ink-2)" }}>
            {t("screens.attendanceRate")}
          </p>
          {/* The practice portal is a rehearsal of the real dashboard, so it
              renders its figures the same way — a literal `%` here would put
              a Latin sign on the Arabic tour beside an Arabic `٪` on the real
              screen it is teaching. */}
          <Num style={{ fontSize: 26, fontWeight: 600, color: "var(--ink)" }}>
            {formatPercent(EMU_RECORD.attendanceRate, locale)}
          </Num>
        </Sheet>
        <Sheet className="p-4">
          <Eyebrow>{t("screens.record")}</Eyebrow>
          <p className="mt-1 text-sm" style={{ color: "var(--ink-2)" }}>
            {t("screens.averageGrade")}
          </p>
          <Num style={{ fontSize: 26, fontWeight: 600, color: "var(--ink)" }}>
            {formatPercent(EMU_RECORD.averagePercent, locale)}
          </Num>
        </Sheet>
      </div>
    </div>
  );
}

/* ── Subjects ──────────────────────────────────────────────────────────── */

export function EmuSubjects({
  openSubject,
  subscribedGroup,
  onOpenSubject,
  onSubscribe,
}: {
  openSubject: string | null;
  subscribedGroup: string | null;
  onOpenSubject: (id: string) => void;
  onSubscribe: (id: string) => void;
}) {
  const t = useTranslations("studentEmulator");
  const locale = useLocale() as Locale;

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold" style={{ color: "var(--ink)" }}>
        {t("screens.subjectsTitle")}
      </h2>
      <div className="flex gap-2">
        <Chip tone="indigo">{t("screens.myTab")}</Chip>
        <Chip tone="neutral">{t("screens.allTab")}</Chip>
      </div>

      {EMU_SUBJECTS.map((sub) => {
        const open = openSubject === sub.id;
        return (
          <Sheet key={sub.id} className="overflow-hidden">
            <EmuTarget id={`subject-${sub.id}`} onClick={() => onOpenSubject(sub.id)}>
              <span className="flex w-full items-center justify-between gap-3 p-4 text-start">
                <span className="font-semibold" style={{ color: "var(--ink)" }}>
                  {pick(sub.name, locale)}
                </span>
                <span className="text-xs" style={{ color: "var(--ink-3)" }}>
                  {open ? "−" : "+"}
                </span>
              </span>
            </EmuTarget>

            {open ? (
              <div className="border-t" style={{ borderColor: "var(--rule-2)" }}>
                {sub.groups.map((g) => {
                  const mine = subscribedGroup === g.id;
                  return (
                    <div
                      key={g.id}
                      data-emu-region={`group-${g.id}`}
                      className="border-b p-4 last:border-b-0"
                      style={{ borderColor: "var(--rule-2)" }}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-medium" style={{ color: "var(--ink)" }}>
                            {pick(g.teacher, locale)}
                          </p>
                          <p className="mt-0.5 text-xs" style={{ color: "var(--ink-2)" }}>
                            {pick(g.days, locale)} · <Num.ClockText value={g.time} locale={locale} />
                          </p>
                          <p className="mt-0.5 text-xs" style={{ color: "var(--ink-3)" }}>
                            {pick(g.center, locale)} · <Num>{g.seats}</Num>
                          </p>
                        </div>
                        <div className="shrink-0">
                          {mine ? (
                            <Chip tone="teal">{t("screens.subscribed")}</Chip>
                          ) : g.full ? (
                            <Chip tone="amber">{t("screens.full")}</Chip>
                          ) : (
                            <EmuTarget
                              id={`subscribe-${g.id}`}
                             
                              onClick={() => onSubscribe(g.id)}
                            >
                              <span className="inline-flex items-center gap-2 rounded-(--radius-step-md) px-3 py-2 text-sm font-semibold"
                                style={{
                                  background: "var(--indigo)",
                                  color: "var(--indigo-ink)",
                                  border: "1px solid var(--indigo)",
                                }}
                              >
                                {t("screens.subscribeMonthly")}
                                {" · "}
                                <Money piasters={g.pricePerMonth} tone="ink" />
                              </span>
                            </EmuTarget>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : null}
          </Sheet>
        );
      })}
    </div>
  );
}

/* ── Wallet ────────────────────────────────────────────────────────────── */

export function EmuWallet({
  balance,
  ledger,
  onTopUp,
}: {
  balance: number;
  ledger: EmuLedgerRow[];
  onTopUp: () => void;
}) {
  const t = useTranslations("studentEmulator");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xl font-semibold" style={{ color: "var(--ink)" }}>
          {t("screens.walletTitle")}
        </h2>
        <EmuTarget id="topup" onClick={onTopUp}>
          <span className="inline-flex items-center rounded-(--radius-step-md) px-3 py-2 text-sm font-semibold"
            style={{ background: "var(--indigo)", color: "var(--indigo-ink)", border: "1px solid var(--indigo)" }}
          >
            {t("screens.topUp")}
          </span>
        </EmuTarget>
      </div>

      <div data-emu-region="balance">
        <Sheet className="p-4">
          <Eyebrow>{t("screens.balance")}</Eyebrow>
          <div className="mt-1">
            <Money piasters={balance} tone="ink" weight={600} className="text-3xl" />
          </div>
        </Sheet>
      </div>

      <div data-emu-region="ledger">
        <Sheet className="p-4">
          <SectionHeading eyebrow={t("screens.record")} title={t("screens.history")} />
          <ul className="mt-2">
            {ledger.map((r) => (
              <li
                key={r.id}
                className="flex items-center justify-between gap-3 border-b py-2 last:border-b-0"
                style={{ borderColor: "var(--rule-2)" }}
              >
                <span className="min-w-0">
                  <span className="block text-sm" style={{ color: "var(--ink)" }}>
                    {t(r.kind === "topup" ? "screens.kindTopUp" : "screens.kindPayment")}
                  </span>
                  <Num style={{ color: "var(--ink-3)", fontSize: 11 }}>
                    {r.date} · {r.ref}
                  </Num>
                </span>
                <Money piasters={r.kind === "topup" ? r.amount : -r.amount} signed />
              </li>
            ))}
          </ul>
        </Sheet>
      </div>

      <div data-emu-region="receipts">
        <Sheet className="p-4">
          <SectionHeading eyebrow={t("screens.record")} title={t("screens.receipts")} />
          <p className="mt-2 text-sm" style={{ color: "var(--ink-2)" }}>
            {t("screens.receiptsBody")}
          </p>
        </Sheet>
      </div>
    </div>
  );
}

/* ── Card ──────────────────────────────────────────────────────────────── */

export function EmuCard({ shown, onShow }: { shown: boolean; onShow: () => void }) {
  const t = useTranslations("studentEmulator");
  const locale = useLocale() as Locale;

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold" style={{ color: "var(--ink)" }}>
        {t("screens.cardTitle")}
      </h2>

      {!shown ? (
        <Sheet className="p-5 text-center">
          <p className="text-sm" style={{ color: "var(--ink-2)" }}>
            {t("screens.cardHint")}
          </p>
          <div className="mt-3 flex justify-center">
            <EmuTarget id="show-card" onClick={onShow}>
              <span className="inline-flex items-center rounded-(--radius-step-md) px-4 py-2 text-sm font-semibold"
                style={{ background: "var(--indigo)", color: "var(--indigo-ink)", border: "1px solid var(--indigo)" }}
              >
                {t("screens.showCard")}
              </span>
            </EmuTarget>
          </div>
        </Sheet>
      ) : (
        <Sheet className="p-5">
          <div
            className="mx-auto flex max-w-sm items-center justify-between gap-4 rounded-(--radius-step-lg) p-4"
            style={{ border: "1px solid var(--rule)", background: "var(--field)" }}
          >
            <div className="min-w-0">
              <Eyebrow>{t("screens.cardEyebrow")}</Eyebrow>
              <p className="mt-1 truncate font-semibold" style={{ color: "var(--ink)" }}>
                {pick(EMU_STUDENT.name, locale)}
              </p>
              <p className="text-xs" style={{ color: "var(--ink-2)" }}>
                {pick(EMU_STUDENT.grade, locale)} · {pick(EMU_STUDENT.track, locale)}
              </p>
              <div data-emu-region="code" className="mt-2">
                <Num style={{ fontSize: 20, fontWeight: 600, letterSpacing: "0.14em", color: "var(--ink)" }}>
                  {EMU_STUDENT.code}
                </Num>
              </div>
            </div>
            {/* A drawn stand-in for the QR: the emulator must not mint a real
                signed payload, and a photographable fake would be worse. */}
            <div
              aria-hidden
              className="grid size-20 shrink-0 grid-cols-4 gap-0.5 rounded p-1"
              style={{ border: "1px solid var(--rule)" }}
            >
              {Array.from({ length: 16 }).map((_, i) => (
                <span
                  key={i}
                  className="block rounded-[1px]"
                  style={{ background: i % 3 === 0 || i % 5 === 0 ? "var(--ink)" : "transparent" }}
                />
              ))}
            </div>
          </div>
        </Sheet>
      )}
    </div>
  );
}
