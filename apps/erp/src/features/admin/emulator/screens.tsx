"use client";

/**
 * The simulated centre screens.
 *
 * Built from the REAL Ledger primitives, exactly as the student and teacher
 * emulators are, so the owner practises on the product's own visual language.
 * Every interactive control carries a `data-emu` id via `EmuTarget`; screens
 * know nothing about steps, missions or progress.
 *
 * THREE THINGS COPIED FROM THE REAL PRODUCT ON PURPOSE, because they are what
 * the tour exists to teach:
 *
 *  1. The counter commits CASH AND ATTENDANCE IN ONE ACTION, with the amount on
 *     the button and a second confirmation — the real screen's two-step commit
 *     (`design/CONSTITUTION.md` §2). A receptionist who learns "collect, then
 *     separately mark present" learns the wrong thing.
 *  2. An unpriced class disables the counter and SAYS SO IN THE COUNTER'S OWN
 *     WORDS — the real hint names the centre owner as the person who fixes it,
 *     which is the whole reason pricing comes before the counter in this script.
 *  3. A refund is a NEW ENTRY beneath the original receipt, never a deletion —
 *     the ledger's actual behaviour, and the thing owners most expect to be
 *     able to "undo".
 */

import { useLocale, useTranslations } from "next-intl";
import { Check, Clock } from "lucide-react";
import type { Locale } from "@/lib/i18n";
import { asKey } from "@/lib/i18n/keys";
import { formatPercent } from "@/lib/i18n/format";
import {
  Chip,
  DoubleTotal,
  Eyebrow,
  Hairline,
  InitialsTile,
  LedgerTable,
  Money,
  Num,
  SectionHeading,
  Sheet,
  Td,
  Th,
  Tr,
} from "@/components/ledger";
import { EmuTarget } from "@/features/emulator/target";
import {
  EMU_CENTRE,
  EMU_CLASS,
  EMU_DASHBOARD,
  EMU_EXPENSES,
  EMU_LESSON,
  EMU_SESSION_PRICE,
  EMU_SPLIT,
  pick,
  type EmuCounterStudent,
  type EmuReceipt,
} from "./world";

/* ── Overview ──────────────────────────────────────────────────────────── */

export function EmuCentreDashboard({ revenue }: { revenue: number }) {
  const t = useTranslations("adminHome.centerEmulator");
  const locale = useLocale() as Locale;

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold" style={{ color: "var(--ink)" }}>
        {t("screens.dashboardTitle")}
      </h2>

      <div data-emu-region="figures" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Sheet className="p-3.5">
          <Eyebrow>{t("screens.totalStudents")}</Eyebrow>
          <p className="mt-1.5 text-2xl font-semibold" style={{ color: "var(--ink)" }}>
            <Num>{EMU_DASHBOARD.totalStudents}</Num>
          </p>
        </Sheet>
        <Sheet className="p-3.5">
          <Eyebrow>{t("screens.activeClasses")}</Eyebrow>
          <p className="mt-1.5 text-2xl font-semibold" style={{ color: "var(--ink)" }}>
            <Num>{EMU_DASHBOARD.activeClasses}</Num>
          </p>
        </Sheet>
        <Sheet className="p-3.5">
          <Eyebrow>{t("screens.revenue")}</Eyebrow>
          <p className="mt-1.5 text-xl font-semibold">
            <Money piasters={revenue} tone="ink" weight={600} />
          </p>
        </Sheet>
        <Sheet className="p-3.5">
          <Eyebrow>{t("screens.attendanceRate")}</Eyebrow>
          <p className="mt-1.5 text-2xl font-semibold" style={{ color: "var(--ink)" }}>
            <Num>{formatPercent(EMU_DASHBOARD.attendancePercent, locale)}</Num>
          </p>
        </Sheet>
      </div>

      <div data-emu-region="pending">
        <Sheet className="p-4">
          <SectionHeading title={t("screens.pendingActions")} />
          <div className="mt-3 space-y-2">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm" style={{ color: "var(--ink-2)" }}>
                {t("screens.pendingUnpriced")}
              </span>
              <Chip tone="red">
                <Num>1</Num>
              </Chip>
            </div>
            <Hairline />
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm" style={{ color: "var(--ink-2)" }}>
                {t("screens.pendingOpenLesson")}
              </span>
              <Chip tone="amber">
                <Num>1</Num>
              </Chip>
            </div>
          </div>
        </Sheet>
      </div>

      <Sheet className="p-4">
        <SectionHeading title={t("screens.todaySnapshot")} />
        <div className="mt-3 flex items-center gap-3">
          <InitialsTile name={pick(EMU_CLASS.title, locale)} size={38} tone="indigo" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold" style={{ color: "var(--ink)" }}>
              {pick(EMU_CLASS.title, locale)}
            </p>
            <p className="text-xs" style={{ color: "var(--ink-3)" }}>
              {pick(EMU_CENTRE.teacher, locale)} · <Num.ClockText value={EMU_LESSON.time} locale={locale} /> ·{" "}
              {pick(EMU_CENTRE.room, locale)}
            </p>
          </div>
          <Chip tone="teal">{t("screens.live")}</Chip>
        </div>
      </Sheet>
    </div>
  );
}

/* ── Classes + pricing (the centre owns this) ──────────────────────────── */

export function EmuCentreClasses({
  open,
  priced,
  onOpen,
  onSetPrice,
}: {
  open: boolean;
  priced: boolean;
  onOpen: () => void;
  onSetPrice: () => void;
}) {
  const t = useTranslations("adminHome.centerEmulator");
  const locale = useLocale() as Locale;

  return (
    <div className="space-y-4">
      <SectionHeading eyebrow={t("nav.classes")} title={t("screens.classesTitle")} />

      <EmuTarget id="class-c1" onClick={onOpen}>
        <Sheet className="p-4">
          <div className="flex items-center gap-3">
            <InitialsTile name={pick(EMU_CLASS.title, locale)} size={38} tone="indigo" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold" style={{ color: "var(--ink)" }}>
                {pick(EMU_CLASS.title, locale)}
              </p>
              <p className="text-xs" style={{ color: "var(--ink-3)" }}>
                {pick(EMU_CENTRE.teacher, locale)} · {pick(EMU_CLASS.days, locale)} ·{" "}
                <Num.ClockText value={EMU_CLASS.time} locale={locale} />
              </p>
            </div>
            {priced ? (
              <Chip tone="teal">{t("screens.priced")}</Chip>
            ) : (
              <Chip tone="red">{t("screens.unpricedChip")}</Chip>
            )}
          </div>
        </Sheet>
      </EmuTarget>

      {open ? (
        priced ? (
          <div data-emu-region="price">
            <Sheet className="p-4">
              <Eyebrow>{t("screens.pricing")}</Eyebrow>
              <div className="mt-2 flex items-baseline justify-between gap-4">
                <span className="text-sm" style={{ color: "var(--ink-2)" }}>
                  {t("screens.perSession")}
                </span>
                <Money piasters={EMU_SESSION_PRICE} tone="ink" weight={600} />
              </div>
              <Hairline className="my-3" />
              <p className="text-xs" style={{ color: "var(--ink-3)" }}>
                {t("screens.pricedHint")}
              </p>
            </Sheet>
          </div>
        ) : (
          <div data-emu-region="unpriced">
            <Sheet blocking className="p-4">
              <Eyebrow>{t("screens.unpricedEyebrow")}</Eyebrow>
              <p className="mt-1.5 text-sm" style={{ color: "var(--ink)" }}>
                {t("screens.unpricedBody")}
              </p>
              <div className="mt-3">
                <EmuTarget id="set-price" onClick={onSetPrice}>
                  <span
                    className="inline-flex items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-sm font-semibold"
                    style={{
                      background: "var(--indigo)",
                      color: "var(--indigo-ink)",
                      border: "1px solid var(--indigo)",
                    }}
                  >
                    {t("screens.setPriceCta", { amount: EMU_SESSION_PRICE / 100 })}
                  </span>
                </EmuTarget>
              </div>
            </Sheet>
          </div>
        )
      ) : null}
    </div>
  );
}

/* ── The counter ───────────────────────────────────────────────────────── */

export function EmuCentreCounter({
  teacherPicked,
  lessonPicked,
  tab,
  roster,
  priced,
  armedFor,
  settled,
  settleArmed,
  onPickTeacher,
  onPickLesson,
  onTab,
  onArmCollect,
  onCollect,
  onCheckIn,
  onArmSettle,
  onSettle,
}: {
  teacherPicked: boolean;
  lessonPicked: boolean;
  tab: "attended" | "all";
  roster: EmuCounterStudent[];
  priced: boolean;
  armedFor: string | null;
  settled: boolean;
  settleArmed: boolean;
  onPickTeacher: () => void;
  onPickLesson: () => void;
  onTab: (t: "attended" | "all") => void;
  onArmCollect: (id: string) => void;
  onCollect: (id: string) => void;
  onCheckIn: (id: string) => void;
  onArmSettle: () => void;
  onSettle: () => void;
}) {
  const t = useTranslations("adminHome.centerEmulator");
  const locale = useLocale() as Locale;

  const attended = roster.filter((s) => s.checkedIn);
  const shown = tab === "attended" ? attended : roster;
  const present = attended.length;
  const centreTotal = present * EMU_SPLIT.centre;

  return (
    <div className="space-y-4">
      <SectionHeading eyebrow={t("nav.counter")} title={t("screens.counterTitle")} />

      {/* The chooser: one line once chosen, open while it IS the task. */}
      <Sheet className="p-3.5">
        <Eyebrow>{t("screens.teacherLabel")}</Eyebrow>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="w-[13rem]">
            <EmuTarget id="teacher-t1" onClick={onPickTeacher}>
              <span
                className="inline-flex w-full items-center gap-2 rounded-(--radius-step-md) px-3 py-2 text-sm"
                style={{
                  border: `1px solid ${teacherPicked ? "var(--indigo)" : "var(--rule)"}`,
                  background: teacherPicked ? "var(--indigo-soft)" : "var(--sheet)",
                  color: teacherPicked ? "var(--indigo)" : "var(--ink-2)",
                }}
              >
                {pick(EMU_CENTRE.teacher, locale)}
              </span>
            </EmuTarget>
          </span>

          {teacherPicked ? (
            <span className="w-[15rem]">
              <EmuTarget id="lesson-s1" onClick={onPickLesson}>
                <span
                  className="inline-flex w-full items-center justify-between gap-2 rounded-(--radius-step-md) px-3 py-2 text-sm"
                  style={{
                    border: `1px solid ${lessonPicked ? "var(--indigo)" : "var(--rule)"}`,
                    background: lessonPicked ? "var(--indigo-soft)" : "var(--sheet)",
                    color: lessonPicked ? "var(--indigo)" : "var(--ink-2)",
                  }}
                >
                  <span>
                    <Num.ClockText value={EMU_LESSON.time} locale={locale} /> · {pick(EMU_CLASS.title, locale)}
                  </span>
                  <Chip tone="teal">{t("screens.live")}</Chip>
                </span>
              </EmuTarget>
            </span>
          ) : null}
        </div>
      </Sheet>

      {!lessonPicked ? (
        <Sheet className="p-4">
          <p className="text-sm" style={{ color: "var(--ink-2)" }}>
            {t("screens.noLessonHint")}
          </p>
        </Sheet>
      ) : (
        <>
          <div data-emu-region="tabs" className="flex flex-wrap gap-2">
            {(["attended", "all"] as const).map((id) => {
              const on = tab === id;
              const n = id === "attended" ? attended.length : roster.length;
              return (
                <EmuTarget key={id} id={`tab-${id}`} onClick={() => onTab(id)}>
                  <span
                    className="inline-flex items-center gap-2 rounded-(--radius-badge) px-3 py-1.5 text-sm font-medium"
                    style={{
                      border: `1px solid ${on ? "var(--indigo)" : "var(--rule)"}`,
                      background: on ? "var(--indigo-soft)" : "transparent",
                      color: on ? "var(--indigo)" : "var(--ink-2)",
                    }}
                  >
                    {t(asKey(`screens.tab_${id}`))} <Num>{n}</Num>
                  </span>
                </EmuTarget>
              );
            })}
          </div>

          <Sheet className="p-4">
            <div className="divide-y" style={{ borderColor: "var(--rule-2)" }}>
              {shown.map((s) => (
                <div
                  key={s.id}
                  data-emu-region={`row-${s.id}`}
                  className="flex flex-wrap items-center gap-3 py-2.5"
                >
                  <InitialsTile name={pick(s.name, locale)} size={30} tone="indigo" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm" style={{ color: "var(--ink)" }}>
                      {pick(s.name, locale)}
                    </span>
                    <span className="block text-xs" style={{ color: "var(--ink-3)" }}>
                      <Num>{s.code}</Num>
                      {!s.onRoster ? ` · ${t("screens.offRoster")}` : ""}
                    </span>
                  </span>

                  {s.checkedIn ? (
                    <Chip tone="teal">{t("screens.checkedIn")}</Chip>
                  ) : s.covered ? (
                    <Chip tone="amber">{t("screens.awaiting")}</Chip>
                  ) : (
                    <Chip tone="red">{t("screens.unpaid")}</Chip>
                  )}

                  {/* Fixed-width action column: the button must land in the same
                      place for every student, or the operator hunts for it. */}
                  <span className="w-[15rem] shrink-0">
                    {s.checkedIn ? (
                      <span
                        className="inline-flex w-full items-center justify-center gap-1.5 rounded-(--radius-step-md) px-3 py-2 text-sm"
                        style={{ border: "1px solid var(--rule)", color: "var(--ink-3)" }}
                      >
                        <Check className="size-3.5" aria-hidden /> {t("screens.done")}
                      </span>
                    ) : s.covered ? (
                      <EmuTarget id={`checkin-${s.id}`} onClick={() => onCheckIn(s.id)}>
                        <span
                          className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold"
                          style={{
                            background: "var(--sheet)",
                            color: "var(--ink)",
                            border: "1px solid var(--rule)",
                          }}
                        >
                          <Clock className="size-3.5" aria-hidden /> {t("screens.checkInCta")}
                        </span>
                      </EmuTarget>
                    ) : !priced ? (
                      <span className="block text-xs" style={{ color: "var(--amber)" }}>
                        {t("screens.noPriceHint")}
                      </span>
                    ) : armedFor === s.id ? (
                      <EmuTarget id={`collect-confirm-${s.id}`} onClick={() => onCollect(s.id)}>
                        <span
                          className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold"
                          style={{
                            background: "var(--indigo)",
                            color: "var(--indigo-ink)",
                            border: "1px solid var(--indigo)",
                          }}
                        >
                          {t("screens.collectConfirm")}
                        </span>
                      </EmuTarget>
                    ) : (
                      <EmuTarget id={`collect-${s.id}`} onClick={() => onArmCollect(s.id)}>
                        <span
                          className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold"
                          style={{
                            background: "var(--sheet)",
                            color: "var(--ink)",
                            border: "1px solid var(--rule)",
                          }}
                        >
                          {t("screens.collectCta", { amount: EMU_SESSION_PRICE / 100 })}
                        </span>
                      </EmuTarget>
                    )}
                  </span>
                </div>
              ))}
            </div>
          </Sheet>

          {/* ── Closing the lesson, from the centre's side ─────────────────── */}
          <div data-emu-region="settle">
            <Sheet
              className="p-4"
              style={{ borderColor: settled ? "var(--rule)" : "var(--indigo)" }}
            >
              <SectionHeading eyebrow={t("screens.settleEyebrow")} title={t("screens.settleTitle")} />

              {settled ? (
                <div data-emu-region="settled" className="mt-3 space-y-2">
                  <Chip tone="teal">{t("screens.settledChip")}</Chip>
                  <p className="text-sm" style={{ color: "var(--ink-2)" }}>
                    {t("screens.settledBody")}
                  </p>
                </div>
              ) : !priced ? (
                <p className="mt-3 text-sm" style={{ color: "var(--ink-2)" }}>
                  {t("screens.blockedUnpriced")}
                </p>
              ) : present === 0 ? (
                <p className="mt-3 text-sm" style={{ color: "var(--ink-2)" }}>
                  {t("screens.blockedNoPresent")}
                </p>
              ) : (
                <>
                  <div className="mt-3 flex items-baseline justify-between gap-4">
                    <span className="text-sm" style={{ color: "var(--ink-2)" }}>
                      {t("screens.settlePresent")}
                    </span>
                    <span className="text-sm font-semibold" style={{ color: "var(--ink)" }}>
                      <Num>{present}</Num>
                    </span>
                  </div>

                  <div data-emu-region="shares" className="mt-3">
                    <Eyebrow>{t("screens.perStudentShares")}</Eyebrow>
                    <div className="mt-1.5 space-y-1.5">
                      {(
                        [
                          ["centre", EMU_SPLIT.centre],
                          ["teacher", EMU_SPLIT.teacher],
                          ["platform", EMU_SPLIT.platform],
                        ] as const
                      ).map(([who, amount]) => (
                        <div key={who} className="flex items-baseline justify-between gap-4">
                          <span className="text-sm" style={{ color: "var(--ink-2)" }}>
                            {t(asKey(`screens.share_${who}`))}
                          </span>
                          <Money piasters={amount} tone="muted" />
                        </div>
                      ))}
                    </div>
                  </div>

                  <DoubleTotal label={t("screens.centreTotal")}>
                    <Money piasters={centreTotal} tone="ink" weight={600} />
                  </DoubleTotal>

                  <div className="mt-3">
                    {settleArmed ? (
                      <EmuTarget id="settle-confirm" onClick={onSettle}>
                        <span
                          className="inline-flex items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-sm font-semibold"
                          style={{
                            background: "var(--indigo)",
                            color: "var(--indigo-ink)",
                            border: "1px solid var(--indigo)",
                          }}
                        >
                          {t("screens.settleConfirm")}
                        </span>
                      </EmuTarget>
                    ) : (
                      <EmuTarget id="settle" onClick={onArmSettle}>
                        <span
                          className="inline-flex items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-sm font-semibold"
                          style={{
                            background: "var(--sheet)",
                            color: "var(--ink)",
                            border: "1px solid var(--rule)",
                          }}
                        >
                          {t("screens.settleAction", {
                            amount: centreTotal / 100,
                            n: present,
                          })}
                        </span>
                      </EmuTarget>
                    )}
                    <p className="mt-2 text-xs" style={{ color: "var(--ink-3)" }}>
                      {settleArmed ? t("screens.settleArmedHint") : t("screens.settleHint")}
                    </p>
                  </div>
                </>
              )}
            </Sheet>
          </div>
        </>
      )}
    </div>
  );
}

/* ── The books ─────────────────────────────────────────────────────────── */

export function EmuCentreBooks({
  revenue,
  receipts,
  onRefund,
}: {
  revenue: number;
  receipts: EmuReceipt[];
  onRefund: (id: string) => void;
}) {
  const t = useTranslations("adminHome.centerEmulator");
  const locale = useLocale() as Locale;
  const net = revenue - EMU_EXPENSES;
  const refundable = receipts.find((r) => r.kind === "payment" && r.id === "r3");

  return (
    <div className="space-y-4">
      <SectionHeading eyebrow={t("nav.books")} title={t("screens.booksTitle")} />

      <div data-emu-region="net" className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Sheet className="p-3.5">
          <Eyebrow>{t("screens.revenue")}</Eyebrow>
          <p className="mt-1.5 text-xl font-semibold">
            <Money piasters={revenue} tone="teal" weight={600} />
          </p>
        </Sheet>
        <Sheet className="p-3.5">
          <Eyebrow>{t("screens.expenses")}</Eyebrow>
          <p className="mt-1.5 text-xl font-semibold">
            <Money piasters={-EMU_EXPENSES} tone="red" weight={600} signed />
          </p>
        </Sheet>
        <Sheet className="p-3.5">
          <Eyebrow>{t("screens.netProfit")}</Eyebrow>
          <p className="mt-1.5 text-xl font-semibold">
            <Money piasters={net} tone="ink" weight={600} />
          </p>
        </Sheet>
      </div>

      <div data-emu-region="receipts">
        <Sheet className="p-4">
          <SectionHeading
            title={t("screens.receipts")}
            action={
              refundable ? (
                <span className="w-[9rem]">
                  <EmuTarget id="refund-r3" onClick={() => onRefund("r3")}>
                    <span
                      className="inline-flex w-full items-center justify-center rounded-lg px-3 py-1.5 text-sm font-semibold"
                      style={{
                        background: "transparent",
                        color: "var(--red)",
                        border: "1px solid var(--red)",
                      }}
                    >
                      {t("screens.refundCta")}
                    </span>
                  </EmuTarget>
                </span>
              ) : null
            }
          />
          <LedgerTable
            className="mt-2"
            head={
              <>
                <Th>{t("screens.receiptNo")}</Th>
                <Th>{t("screens.student")}</Th>
                <Th align="end">{t("screens.amount")}</Th>
              </>
            }
          >
            {receipts.map((r) => (
              <Tr key={r.id}>
                <Td>
                  <Num>{r.no}</Num>
                </Td>
                <Td>{pick(r.student, locale)}</Td>
                <Td align="end">
                  {/* `signed` is required, not decoration: <Money> renders
                      Math.abs(v) and draws the − ONLY when asked, so a refund
                      without it reads as another payment of the same size —
                      the one row on this screen that must not be misread. */}
                  <Money
                    piasters={r.kind === "refund" ? -r.amount : r.amount}
                    tone={r.kind === "refund" ? "red" : "teal"}
                    signed={r.kind === "refund"}
                  />
                </Td>
              </Tr>
            ))}
          </LedgerTable>
          <p className="mt-3 text-xs" style={{ color: "var(--ink-3)" }}>
            {t("screens.refundFinality")}
          </p>
        </Sheet>
      </div>
    </div>
  );
}
