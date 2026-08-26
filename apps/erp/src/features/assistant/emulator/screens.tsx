"use client";

/**
 * The simulated assistant screens.
 *
 * Built from the REAL Ledger primitives, exactly as the other emulators are.
 * Every interactive control carries a `data-emu` id via `EmuTarget`; screens
 * know nothing about steps, missions or progress.
 *
 * THREE THINGS COPIED FROM THE REAL PRODUCT ON PURPOSE:
 *
 *  1. THE DOOR REFUSES. A student who never passed the counter cannot be
 *     confirmed at the door, and the screen says why in the counter's own
 *     words. This is the single behaviour a new assistant is most likely to
 *     "helpfully" work around, and working around it is what puts an unpaid
 *     child into a settled lesson.
 *  2. THE SETTLEMENT NAMES WHOSE MONEY IT IS. The card credits the TEACHER's
 *     wallet and records the action as the assistant acting on their behalf —
 *     so nobody finishes this tour expecting a payout of their own.
 *  3. THE MESSAGE CARRIES THE ASSISTANT'S OWN NAME. Not the teacher's. An adult
 *     must never speak to a minor from behind someone else's identity, and the
 *     practice copy shows the sender label rather than asserting it in prose.
 */

import { useLocale, useTranslations } from "next-intl";
import { Check, Clock, X } from "lucide-react";
import type { Locale } from "@/lib/i18n";
import { asKey } from "@/lib/i18n/keys";
import {
  Chip,
  DoubleTotal,
  Eyebrow,
  Hairline,
  InitialsTile,
  Money,
  Num,
  SectionHeading,
  Sheet,
} from "@/components/ledger";
import { EmuTarget } from "@/features/emulator/target";
import {
  EMU_ASSISTANT,
  EMU_CLASS,
  EMU_PRINCIPAL,
  EMU_SESSION_PRICE,
  EMU_SPLIT,
  pick,
  type EmuAttendance,
  type EmuMessage,
  type EmuNote,
  type EmuPupil,
} from "./world";

/* ── Home: whose account is this ───────────────────────────────────────── */

export function EmuAssistantHome() {
  const t = useTranslations("assistant.emulator");
  const locale = useLocale() as Locale;

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold" style={{ color: "var(--ink)" }}>
        {t("screens.homeTitle")}
      </h2>

      <div data-emu-region="principal">
        <Sheet className="p-4">
          <Eyebrow>{t("screens.actingFor")}</Eyebrow>
          <div className="mt-2 flex items-center gap-3">
            <InitialsTile name={pick(EMU_PRINCIPAL, locale)} size={38} tone="indigo" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold" style={{ color: "var(--ink)" }}>
                {pick(EMU_PRINCIPAL, locale)}
              </p>
              <p className="text-xs" style={{ color: "var(--ink-3)" }}>
                {t("screens.youAre", { name: pick(EMU_ASSISTANT, locale) })}
              </p>
            </div>
          </div>
          <Hairline className="my-3" />
          <p className="text-sm" style={{ color: "var(--ink-2)" }}>
            {t("screens.actingBody")}
          </p>
        </Sheet>
      </div>

      <Sheet className="p-4">
        <SectionHeading title={t("screens.todayLesson")} />
        <div className="mt-3 flex items-center gap-3">
          <InitialsTile name={pick(EMU_CLASS.title, locale)} size={38} tone="indigo" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold" style={{ color: "var(--ink)" }}>
              {pick(EMU_CLASS.title, locale)}
            </p>
            <p className="text-xs" style={{ color: "var(--ink-3)" }}>
              <Num.ClockText value={EMU_CLASS.time} locale={locale} /> · {pick(EMU_CLASS.room, locale)}
            </p>
          </div>
          <Chip tone="teal">{t("screens.live")}</Chip>
        </div>
      </Sheet>

      <div data-emu-region="limits">
        <Sheet className="p-4">
          <Eyebrow>{t("screens.limitsEyebrow")}</Eyebrow>
          <ul className="mt-2 space-y-1.5 text-sm" style={{ color: "var(--ink-2)" }}>
            <li>· {t("screens.limitWallet")}</li>
            <li>· {t("screens.limitAssistants")}</li>
            <li>· {t("screens.limitAudit")}</li>
          </ul>
        </Sheet>
      </div>
    </div>
  );
}

/* ── Attendance + the settlement (the teacher's money) ─────────────────── */

const STATUS_TONE: Record<EmuAttendance, "teal" | "red" | "amber" | "neutral"> = {
  present: "teal",
  absent: "red",
  excused: "neutral",
  counter_only: "amber",
};

export function EmuAssistantAttendance({
  lessonOpen,
  roster,
  saved,
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
  settled: boolean;
  armed: boolean;
  onOpenLesson: () => void;
  onSetStatus: (id: string, status: EmuAttendance) => void;
  onSave: () => void;
  onArm: () => void;
  onSettle: () => void;
}) {
  const t = useTranslations("assistant.emulator");
  const locale = useLocale() as Locale;

  const present = roster.filter((p) => p.status === "present").length;
  const teacherTotal = present * EMU_SPLIT.teacher;

  return (
    <div className="space-y-4">
      <SectionHeading eyebrow={t("nav.attendance")} title={t("screens.attendanceTitle")} />

      <EmuTarget id="lesson-s1" onClick={onOpenLesson}>
        <Sheet className="flex items-center justify-between gap-3 p-3.5">
          <span className="text-sm font-semibold" style={{ color: "var(--ink)" }}>
            {pick(EMU_CLASS.title, locale)} · <Num.ClockText value={EMU_CLASS.time} locale={locale} />
          </span>
          <Chip tone={lessonOpen ? "indigo" : "amber"}>
            {lessonOpen ? t("screens.open") : t("screens.markCta")}
          </Chip>
        </Sheet>
      </EmuTarget>

      {lessonOpen ? (
        <>
          {/* Pinned above the roster, mirroring the real register — see the
              teacher emulator's copy of this block for the reasoning. The
              assistant meets this state more than anyone: in counter+door mode
              the hall door is THEIR job, so an unresolved row is theirs to
              clear. */}
          {roster.some((p) => p.status === "counter_only") ? (
            <div data-emu-region="counterOnly">
              <Sheet className="p-4" style={{ borderColor: "var(--amber)", borderWidth: 2 }}>
                <SectionHeading
                  title={t("screens.counterOnly")}
                  action={
                    <Chip tone="amber">
                      {roster.filter((p) => p.status === "counter_only").length}
                    </Chip>
                  }
                />
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
                  <div key={p.id} className="flex flex-wrap items-center gap-3 py-2.5">
                    <InitialsTile name={pick(p.name, locale)} size={30} tone="indigo" />
                    <span
                      className="min-w-0 flex-1 truncate text-sm"
                      style={{ color: "var(--ink)" }}
                    >
                      {pick(p.name, locale)}
                    </span>
                    <Chip tone={STATUS_TONE[p.status]}>
                      {p.status === "counter_only"
                        ? t("screens.counterOnly")
                        : t(asKey(`screens.status_${p.status}`))}
                    </Chip>
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
                    {t("screens.settledBody", { teacher: pick(EMU_PRINCIPAL, locale) })}
                  </p>
                  <p className="text-xs" style={{ color: "var(--ink-3)" }}>
                    {t("screens.auditLine", {
                      assistant: pick(EMU_ASSISTANT, locale),
                      teacher: pick(EMU_PRINCIPAL, locale),
                    })}
                  </p>
                </div>
              ) : !saved ? (
                <p className="mt-3 text-sm" style={{ color: "var(--ink-2)" }}>
                  {t("screens.blockedNoAttendance")}
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

                  <DoubleTotal
                    label={t("screens.teacherTotal", { teacher: pick(EMU_PRINCIPAL, locale) })}
                  >
                    <Money piasters={teacherTotal} tone="ink" weight={600} />
                  </DoubleTotal>

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

/* ── The door ──────────────────────────────────────────────────────────── */

export function EmuAssistantDoor({
  roster,
  refusedId,
  onConfirm,
}: {
  roster: EmuPupil[];
  refusedId: string | null;
  onConfirm: (id: string) => void;
}) {
  const t = useTranslations("assistant.emulator");
  const locale = useLocale() as Locale;
  const waiting = roster.filter((p) => !p.doorConfirmed);

  return (
    <div className="space-y-4">
      <SectionHeading eyebrow={t("nav.door")} title={t("screens.doorTitle")} />

      <Sheet className="p-4">
        <Eyebrow>{t("screens.atTheDoor")}</Eyebrow>
        <p className="mt-1.5 text-sm" style={{ color: "var(--ink-2)" }}>
          {t("screens.doorHint")}
        </p>
      </Sheet>

      <Sheet className="p-4">
        <SectionHeading
          title={t("screens.doorRoster")}
          action={
            <span className="text-xs" style={{ color: "var(--ink-3)" }}>
              {t("screens.awaitingDoor", { n: waiting.length })}
            </span>
          }
        />
        <div className="mt-3 divide-y" style={{ borderColor: "var(--rule-2)" }}>
          {roster.map((p) => (
            <div
              key={p.id}
              data-emu-region={`row-${p.id}`}
              className="flex flex-wrap items-center gap-3 py-2.5"
            >
              <InitialsTile name={pick(p.name, locale)} size={30} tone="indigo" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm" style={{ color: "var(--ink)" }}>
                  {pick(p.name, locale)}
                </span>
                <span className="block text-xs" style={{ color: "var(--ink-3)" }}>
                  <Num>{p.code}</Num>
                </span>
              </span>

              {p.doorConfirmed ? (
                <Chip tone="teal">{t("screens.doorDone")}</Chip>
              ) : p.counterChecked ? (
                <Chip tone="amber">{t("screens.waiting")}</Chip>
              ) : (
                <Chip tone="red">{t("screens.noCounter")}</Chip>
              )}

              <span className="w-[8.5rem] shrink-0">
                {p.doorConfirmed ? (
                  <span
                    className="inline-flex w-full items-center justify-center gap-1.5 rounded-(--radius-step-md) px-3 py-2 text-sm"
                    style={{ border: "1px solid var(--rule)", color: "var(--ink-3)" }}
                  >
                    <Check className="size-3.5" aria-hidden /> {t("screens.doorDone")}
                  </span>
                ) : (
                  <EmuTarget id={`door-${p.id}`} onClick={() => onConfirm(p.id)}>
                    <span
                      className="inline-flex w-full items-center justify-center rounded-lg px-3 py-2 text-sm font-semibold"
                      style={{
                        background: "var(--sheet)",
                        color: "var(--ink)",
                        border: "1px solid var(--rule)",
                      }}
                    >
                      {t("screens.confirm")}
                    </span>
                  </EmuTarget>
                )}
              </span>

              {refusedId === p.id ? (
                <p className="w-full text-xs" style={{ color: "var(--red)" }} role="status">
                  {t("screens.counterFirst")}
                </p>
              ) : null}
            </div>
          ))}
        </div>
      </Sheet>
    </div>
  );
}

/* ── Messages: your own name ───────────────────────────────────────────── */

export function EmuAssistantMessages({
  messages,
  onSend,
}: {
  messages: EmuMessage[];
  onSend: () => void;
}) {
  const t = useTranslations("assistant.emulator");
  const locale = useLocale() as Locale;

  return (
    <div className="space-y-4">
      <SectionHeading eyebrow={t("nav.messages")} title={t("screens.messagesTitle")} />

      <div data-emu-region="thread">
        <Sheet className="p-4">
          <div className="space-y-3">
            {messages.map((m) => (
              <div key={m.id}>
                <p className="text-xs" style={{ color: m.mine ? "var(--indigo)" : "var(--ink-3)" }}>
                  {pick(m.from, locale)}
                  {m.mine ? ` — ${t("screens.you")}` : ""}
                </p>
                <p className="mt-0.5 text-sm" style={{ color: "var(--ink)" }}>
                  {pick(m.body, locale)}
                </p>
              </div>
            ))}
          </div>

          <Hairline className="my-3" />

          <EmuTarget id="send" onClick={onSend}>
            <span
              className="inline-flex items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-sm font-semibold"
              style={{
                background: "var(--indigo)",
                color: "var(--indigo-ink)",
                border: "1px solid var(--indigo)",
              }}
            >
              {t("screens.sendReply")}
            </span>
          </EmuTarget>
        </Sheet>
      </div>
    </div>
  );
}

/* ── Team notes ────────────────────────────────────────────────────────── */

export function EmuAssistantNotes({
  notes,
  onDone,
}: {
  notes: EmuNote[];
  onDone: (id: string) => void;
}) {
  const t = useTranslations("assistant.emulator");
  const locale = useLocale() as Locale;

  return (
    <div className="space-y-4">
      <SectionHeading eyebrow={t("nav.notes")} title={t("screens.notesTitle")} />

      <div className="space-y-3">
        {notes.map((n) => (
          <div key={n.id} data-emu-region={`note-${n.id}`}>
            <Sheet className="p-4">
              <p
                className="text-sm"
                style={{
                  color: n.status === "done" ? "var(--ink-3)" : "var(--ink)",
                  textDecoration: n.status === "done" ? "line-through" : undefined,
                }}
              >
                {pick(n.body, locale)}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Chip tone={n.status === "done" ? "teal" : "amber"}>
                  {t(asKey(`screens.note_${n.status}`))}
                </Chip>
                <span className="text-xs" style={{ color: "var(--ink-3)" }}>
                  {t("screens.byWhom", { name: pick(n.by, locale) })} ·{" "}
                  {t("screens.readBy", { n: n.readBy, total: n.total })}
                </span>
                {n.status === "open" ? (
                  <span className="w-[7rem]">
                    <EmuTarget id={`done-${n.id}`} onClick={() => onDone(n.id)}>
                      <span
                        className="inline-flex w-full items-center justify-center rounded-lg px-3 py-1.5 text-sm font-semibold"
                        style={{
                          background: "var(--sheet)",
                          color: "var(--ink)",
                          border: "1px solid var(--rule)",
                        }}
                      >
                        {t("screens.markDone")}
                      </span>
                    </EmuTarget>
                  </span>
                ) : null}
              </div>
            </Sheet>
          </div>
        ))}
      </div>
    </div>
  );
}
