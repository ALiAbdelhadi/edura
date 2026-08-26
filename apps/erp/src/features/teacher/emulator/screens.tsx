"use client";

/**
 * The simulated teacher screens.
 *
 * Built from the REAL Ledger primitives (`@/components/ledger`) rather than
 * look-alike markup, so what the teacher practises on is the product's own
 * visual language down to the hairlines and the figure treatment. When the
 * design changes, these change with it.
 *
 * Every interactive control carries a `data-emu` id via `EmuTarget`. That is the
 * only contract between a screen and the engine: the engine highlights
 * `data-emu={target}` and advances when it is clicked. Screens know nothing
 * about steps, missions or progress.
 *
 * TWO THINGS THESE SCREENS COPY FROM THE REAL PRODUCT ON PURPOSE, because they
 * are what the tour exists to teach:
 *
 *  1. The settle button CARRIES ITS OWN AMOUNT and commits in two steps
 *     (`design/CONSTITUTION.md` §2) — the teacher reads the figure they are
 *     about to write, then confirms.
 *  2. When the lesson cannot be closed, the card states the REASON in prose
 *     instead of showing a dead button — the real card's behaviour, and the
 *     difference between a teacher who fixes their pricing and one who thinks
 *     the app is broken.
 */

import { useLocale, useTranslations } from "next-intl";
import { Check, Clock, X } from "lucide-react";
import type { Locale } from "@/lib/i18n";
import { asKey } from "@/lib/i18n/keys";
import { formatPercent } from "@/lib/i18n/format";
import {
  Chip,
  DoubleTotal,
  Eyebrow,
  Hairline,
  InitialsTile,
  LedgerEmpty,
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
  EMU_CLASS,
  EMU_DASHBOARD,
  EMU_LESSONS,
  EMU_SESSION_PRICE,
  EMU_SPLIT,
  EMU_TEACHER,
  pick,
  type EmuAttendance,
  type EmuPayoutRow,
  type EmuPupil,
  type EmuWalletRow,
} from "./world";

/* ── Dashboard ─────────────────────────────────────────────────────────── */

export function EmuTeacherDashboard() {
  const t = useTranslations("teacher.teacherEmulator");
  const locale = useLocale() as Locale;

  const figures = [
    { id: "classesToday", value: EMU_DASHBOARD.classesToday },
    { id: "pendingGrades", value: EMU_DASHBOARD.pendingGrades, region: "pending" },
    { id: "totalStudents", value: EMU_DASHBOARD.totalStudents },
    {
      id: "attendancePct",
      value: formatPercent(EMU_DASHBOARD.attendancePercent, locale),
    },
  ] as const;

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold" style={{ color: "var(--ink)" }}>
        {t("screens.dashboardTitle")}
      </h2>

      <div data-emu-region="figures" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {figures.map((f) => (
          <div key={f.id} data-emu-region={"region" in f ? f.region : undefined}>
            <Sheet className="p-3.5">
              <Eyebrow>{t(asKey(`screens.${f.id}`))}</Eyebrow>
              <p className="mt-1.5 text-2xl font-semibold" style={{ color: "var(--ink)" }}>
                <Num>{f.value}</Num>
              </p>
            </Sheet>
          </div>
        ))}
      </div>

      <div data-emu-region="schedule">
        <Sheet className="p-4">
          <SectionHeading title={t("screens.todaySchedule")} />
          <div className="mt-3 flex items-center gap-3">
            <InitialsTile name={pick(EMU_CLASS.title, locale)} size={38} tone="indigo" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold" style={{ color: "var(--ink)" }}>
                {pick(EMU_CLASS.title, locale)}
              </p>
              <p className="text-xs" style={{ color: "var(--ink-3)" }}>
                <Num.ClockText value={EMU_LESSONS[0]!.time} locale={locale} /> · {pick(EMU_TEACHER.room, locale)}
              </p>
            </div>
            <Chip tone="amber">{t("screens.upcoming")}</Chip>
          </div>
        </Sheet>
      </div>
    </div>
  );
}

/* ── Classes + pricing ─────────────────────────────────────────────────── */

export function EmuTeacherClasses({
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
  const t = useTranslations("teacher.teacherEmulator");
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
                {pick(EMU_CLASS.days, locale)} · <Num.ClockText value={EMU_CLASS.time} locale={locale} /> ·{" "}
                {t("screens.studentsCount", { n: EMU_DASHBOARD.totalStudents })}
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

/* ── Attendance + the settlement ───────────────────────────────────────── */

const STATUS_TONE: Record<EmuAttendance, "teal" | "red" | "amber" | "neutral"> = {
  present: "teal",
  absent: "red",
  excused: "neutral",
  counter_only: "amber",
};

export function EmuTeacherAttendance({
  lessonOpen,
  roster,
  saved,
  priced,
  settled,
  armed,
  onOpenLesson,
  onSetStatus,
  onSave,
  onArm,
  onSettle,
}: {
  lessonOpen: boolean;
  roster: EmuPupil[];
  saved: boolean;
  priced: boolean;
  settled: boolean;
  armed: boolean;
  onOpenLesson: () => void;
  onSetStatus: (id: string, status: EmuAttendance) => void;
  onSave: () => void;
  onArm: () => void;
  onSettle: () => void;
}) {
  const t = useTranslations("teacher.teacherEmulator");
  const locale = useLocale() as Locale;

  const present = roster.filter((p) => p.status === "present").length;
  const teacherTotal = present * EMU_SPLIT.teacher;

  return (
    <div className="space-y-4">
      <SectionHeading eyebrow={t("nav.attendance")} title={t("screens.attendanceTitle")} />

      {/* The lessons of the last fortnight, exactly the real screen's framing. */}
      <div className="space-y-2">
        <Eyebrow>{t("screens.last14")}</Eyebrow>
        {EMU_LESSONS.map((l) =>
          l.settled ? (
            <Sheet key={l.id} className="flex items-center justify-between gap-3 p-3.5">
              <span className="text-sm" style={{ color: "var(--ink-2)" }}>
                {pick(l.date, locale)} · <Num.ClockText value={l.time} locale={locale} />
              </span>
              <Chip tone="teal">{t("screens.completed")}</Chip>
            </Sheet>
          ) : (
            <EmuTarget key={l.id} id={`lesson-${l.id}`} onClick={onOpenLesson}>
              <Sheet className="flex items-center justify-between gap-3 p-3.5">
                <span className="text-sm font-semibold" style={{ color: "var(--ink)" }}>
                  {pick(l.date, locale)} · <Num.ClockText value={l.time} locale={locale} />
                </span>
                <Chip tone={lessonOpen ? "indigo" : "amber"}>
                  {lessonOpen ? t("screens.open") : t("screens.markCta")}
                </Chip>
              </Sheet>
            </EmuTarget>
          ),
        )}
      </div>

      {lessonOpen ? (
        <>
          {/* THE PINNED QUEUE, mirroring the real register.
              `counter_only` used to sit inline in the roster wearing an amber
              chip — which is exactly what the real screen did, and exactly what
              the audit found wrong: the same amber as "excused", wherever the
              list happened to sort it. The real register now pins these rows
              ABOVE the roster with a count, so the rehearsal does too, or it
              teaches a place that no longer exists. */}
          {roster.some((p) => p.status === "counter_only") ? (
            <div data-emu-region="counterOnly">
              <Sheet
                className="p-4"
                style={{ borderColor: "var(--amber)", borderWidth: 2 }}
              >
                <SectionHeading
                  title={t("screens.counterOnly")}
                  action={
                    <Chip tone="amber">
                      {roster.filter((p) => p.status === "counter_only").length}
                    </Chip>
                  }
                />
                <p className="mt-1 text-xs" style={{ color: "var(--ink-3)" }}>
                  {t("screens.counterOnlyHint")}
                </p>
                <div className="mt-2 divide-y" style={{ borderColor: "var(--rule-2)" }}>
                  {roster
                    .filter((p) => p.status === "counter_only")
                    .map((p) => (
                      <div
                        key={p.id}
                        data-emu-region={`row-${p.id}`}
                        className="flex flex-wrap items-center gap-3 py-2.5"
                      >
                        <InitialsTile name={pick(p.name, locale)} size={30} tone="indigo" />
                        <span
                          className="min-w-0 flex-1 truncate text-sm"
                          style={{ color: "var(--ink)" }}
                        >
                          {pick(p.name, locale)}
                        </span>
                        <span className="flex shrink-0 gap-1.5">
                          {(["present", "absent"] as const).map((st) => {
                            const Icon = st === "present" ? Check : X;
                            return (
                              <span key={st} className="w-[2.25rem]">
                                <EmuTarget id={`${st}-${p.id}`} onClick={() => onSetStatus(p.id, st)}>
                                  <span
                                    className="inline-flex h-8 w-full items-center justify-center rounded-(--radius-step-md)"
                                    style={{
                                      border: "1px solid var(--rule)",
                                      background: "var(--sheet)",
                                      color: "var(--ink-3)",
                                    }}
                                    title={t(asKey(`screens.status_${st}`))}
                                  >
                                    <Icon className="size-4" aria-hidden />
                                  </span>
                                </EmuTarget>
                              </span>
                            );
                          })}
                        </span>
                      </div>
                    ))}
                </div>
              </Sheet>
            </div>
          ) : null}

          <div data-emu-region="roster">
            <Sheet className="p-4">
              <SectionHeading
                title={t("screens.roster")}
                action={
                  <span className="text-xs" style={{ color: "var(--ink-3)" }}>
                    {t("screens.presentCount", { n: present, total: roster.length })}
                  </span>
                }
              />
              <div className="mt-3 divide-y" style={{ borderColor: "var(--rule-2)" }}>
                {roster
                  .filter((p) => p.status !== "counter_only")
                  .map((p) => (
                  <div
                    key={p.id}
                    data-emu-region={`row-${p.id}`}
                    className="flex flex-wrap items-center gap-3 py-2.5"
                  >
                    <InitialsTile name={pick(p.name, locale)} size={30} tone="indigo" />
                    <span
                      className="min-w-0 flex-1 truncate text-sm"
                      style={{ color: "var(--ink)" }}
                    >
                      {pick(p.name, locale)}
                    </span>

                    {p.status === "counter_only" ? (
                      <Chip tone="amber">{t("screens.counterOnly")}</Chip>
                    ) : (
                      <Chip tone={STATUS_TONE[p.status]}>
                        {t(asKey(`screens.status_${p.status}`))}
                      </Chip>
                    )}

                    {/* Fixed-width action column: every control in the queue must
                        land in the same place, or the operator hunts for it. */}
                    <span className="flex shrink-0 gap-1.5">
                      {(["present", "absent", "excused"] as const).map((s) => {
                        const Icon = s === "present" ? Check : s === "absent" ? X : Clock;
                        const on = p.status === s;
                        return (
                          <span key={s} className="w-[2.25rem]">
                            <EmuTarget id={`${s}-${p.id}`} onClick={() => onSetStatus(p.id, s)}>
                              <span
                                className="inline-flex h-8 w-full items-center justify-center rounded-(--radius-step-md)"
                                style={{
                                  border: `1px solid ${on ? "var(--indigo)" : "var(--rule)"}`,
                                  background: on ? "var(--indigo-soft)" : "var(--sheet)",
                                  color: on ? "var(--indigo)" : "var(--ink-3)",
                                }}
                                title={t(asKey(`screens.status_${s}`))}
                              >
                                <Icon className="size-4" aria-hidden />
                              </span>
                            </EmuTarget>
                          </span>
                        );
                      })}
                    </span>
                  </div>
                ))}
              </div>

              <div className="mt-3">
                <EmuTarget id="save-attendance" onClick={onSave}>
                  <span
                    className="inline-flex items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-sm font-semibold"
                    style={{
                      background: saved ? "var(--sheet)" : "var(--indigo)",
                      color: saved ? "var(--ink)" : "var(--indigo-ink)",
                      border: `1px solid ${saved ? "var(--rule)" : "var(--indigo)"}`,
                    }}
                  >
                    {saved ? t("screens.saved") : t("screens.saveAttendance")}
                  </span>
                </EmuTarget>
              </div>
            </Sheet>
          </div>

          {/* ── The settlement card ───────────────────────────────────────── */}
          <div data-emu-region="settle">
            <Sheet className="p-4" style={{ borderColor: settled ? "var(--rule)" : "var(--indigo)" }}>
              <SectionHeading eyebrow={t("screens.settleEyebrow")} title={t("screens.settleTitle")} />

              {settled ? (
                <div data-emu-region="settled" className="mt-3 space-y-2">
                  <Chip tone="teal">{t("screens.settledChip")}</Chip>
                  <p className="text-sm" style={{ color: "var(--ink-2)" }}>
                    {t("screens.settledBody")}
                  </p>
                </div>
              ) : !saved ? (
                <p className="mt-3 text-sm" style={{ color: "var(--ink-2)" }}>
                  {t("screens.blockedNoAttendance")}
                </p>
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
                  <div className="mt-1.5 flex items-baseline justify-between gap-4">
                    <span className="text-sm" style={{ color: "var(--ink-2)" }}>
                      {t("screens.settleLessonPrice")}
                    </span>
                    <Money piasters={EMU_SESSION_PRICE} tone="ink" />
                  </div>

                  <div data-emu-region="shares" className="mt-3">
                    <Eyebrow>{t("screens.perStudentShares")}</Eyebrow>
                    <div className="mt-1.5 space-y-1.5">
                      {(
                        [
                          ["teacher", EMU_SPLIT.teacher],
                          ["centre", EMU_SPLIT.centre],
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

                  <DoubleTotal label={t("screens.teacherTotal")}>
                    <Money piasters={teacherTotal} tone="ink" weight={600} />
                  </DoubleTotal>

                  {/* Two-step commit, amount on the button (CONSTITUTION §2). */}
                  <div className="mt-3">
                    {armed ? (
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
                      <EmuTarget id="settle" onClick={onArm}>
                        <span
                          className="inline-flex items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-sm font-semibold"
                          style={{
                            background: "var(--sheet)",
                            color: "var(--ink)",
                            border: "1px solid var(--rule)",
                          }}
                        >
                          {t("screens.settleAction", {
                            amount: teacherTotal / 100,
                            n: present,
                          })}
                        </span>
                      </EmuTarget>
                    )}
                    <p className="mt-2 text-xs" style={{ color: "var(--ink-3)" }}>
                      {armed ? t("screens.settleArmedHint") : t("screens.settleHint")}
                    </p>
                  </div>
                </>
              )}
            </Sheet>
          </div>
        </>
      ) : null}
    </div>
  );
}

/* ── Wallet ────────────────────────────────────────────────────────────── */

export function EmuTeacherWallet({
  balance,
  reserved,
  rows,
  requests,
  armed,
  onArm,
  onWithdraw,
}: {
  balance: number;
  reserved: number;
  rows: EmuWalletRow[];
  requests: EmuPayoutRow[];
  armed: boolean;
  onArm: () => void;
  onWithdraw: () => void;
}) {
  const t = useTranslations("teacher.teacherEmulator");
  const available = Math.max(0, balance - reserved);

  return (
    <div className="space-y-4">
      <SectionHeading eyebrow={t("nav.wallet")} title={t("screens.walletTitle")} />

      <div data-emu-region="figures" className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {(
          [
            ["balance", balance, "ink"],
            ["available", available, "teal"],
            ["reserved", reserved, "muted"],
          ] as const
        ).map(([id, value, tone]) => (
          <Sheet key={id} className="p-3.5">
            <Eyebrow>{t(asKey(`screens.wallet_${id}`))}</Eyebrow>
            <p className="mt-1.5 text-xl font-semibold">
              <Money piasters={value} tone={tone} weight={600} />
            </p>
          </Sheet>
        ))}
      </div>

      <div className="space-y-1.5">
        {available > 0 ? (
          armed ? (
            /* ARMED — the real button turns red and says it cannot be undone.
               Two presses, exactly as the wallet now asks for. */
            <>
              <EmuTarget id="withdraw-confirm" onClick={onWithdraw}>
                <span
                  className="inline-flex items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-sm font-semibold"
                  style={{
                    background: "var(--red-soft)",
                    color: "var(--red)",
                    border: "1px solid var(--red)",
                  }}
                >
                  {t("screens.withdrawConfirm")}
                </span>
              </EmuTarget>
              <p className="text-[11px]" style={{ color: "var(--red)" }}>
                {t("screens.withdrawArmedHint")}
              </p>
            </>
          ) : (
            <EmuTarget id="withdraw" onClick={onArm}>
              <span
                className="inline-flex items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-sm font-semibold"
                style={{
                  background: "var(--indigo)",
                  color: "var(--indigo-ink)",
                  border: "1px solid var(--indigo)",
                }}
              >
                {t("screens.withdrawCta")}
              </span>
            </EmuTarget>
          )
        ) : (
          <p className="text-xs" style={{ color: "var(--ink-3)" }}>
            {t("screens.nothingAvailable")}
          </p>
        )}
      </div>

      <div data-emu-region="requests">
        <Sheet className="p-4">
          <SectionHeading title={t("screens.payoutRequests")} />
          {requests.length === 0 ? (
            <div className="mt-3">
              <LedgerEmpty title={t("screens.noRequests")} hint={t("screens.noRequestsHint")} />
            </div>
          ) : (
            <LedgerTable
              className="mt-2"
              head={
                <>
                  <Th>{t("screens.amount")}</Th>
                  <Th>{t("screens.status")}</Th>
                  <Th align="end">{t("screens.requested")}</Th>
                </>
              }
            >
              {requests.map((r) => (
                <Tr key={r.id}>
                  <Td>
                    <Money piasters={r.amount} tone="ink" />
                  </Td>
                  <Td>
                    <Chip tone="amber">{t("screens.pending")}</Chip>
                  </Td>
                  <Td align="end">
                    <Num>{r.requested}</Num>
                  </Td>
                </Tr>
              ))}
            </LedgerTable>
          )}
        </Sheet>
      </div>

      <Sheet className="p-4">
        <SectionHeading title={t("screens.walletHistory")} />
        <LedgerTable
          className="mt-2"
          head={
            <>
              <Th>{t("screens.ref")}</Th>
              <Th>{t("screens.type")}</Th>
              <Th align="end">{t("screens.amount")}</Th>
            </>
          }
        >
          {rows.map((r) => (
            <Tr key={r.id}>
              <Td>
                <Num>{r.ref}</Num>
              </Td>
              <Td>{t(asKey(`screens.kind_${r.kind}`))}</Td>
              <Td align="end">
                <Money piasters={r.amount} tone="teal" />
              </Td>
            </Tr>
          ))}
        </LedgerTable>
      </Sheet>
    </div>
  );
}
