"use client";

import { Eyebrow, LedgerButton, Sheet } from "@/components/ledger";
import styles from "@/features/emulator/emulator.module.css";
import { EmuTarget, EmuTargetProvider } from "@/features/emulator/target";
import { asKey } from "@/lib/i18n/keys";
import { BookOpen, Check, ChevronRight, Coins, Home, Receipt, RotateCcw, Users } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EmuCentreBooks, EmuCentreClasses, EmuCentreCounter, EmuCentreDashboard } from "./screens";
import { FLAT_STEPS, MISSIONS, type EmuScreen } from "./script";
import {
  EMU_RECEIPTS_OPENING,
  EMU_REVENUE_OPENING,
  EMU_ROSTER,
  EMU_SESSION_PRICE,
  EMU_SPLIT,
  type EmuCounterStudent,
  type EmuReceipt,
} from "./world";

const PROGRESS_KEY = "edura.centerEmulator.step";

const ICON = {
  home: Home,
  book: BookOpen,
  counter: Users,
  coins: Coins,
  ledger: Receipt,
} as const;

export function CenterEmulator({ onDone }: { onDone?: () => void } = {}) {
  const t = useTranslations("adminHome.centerEmulator");
  const stageRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const [missed, setMissed] = useState(false);
  const [classOpen, setClassOpen] = useState(false);
  const [priced, setPriced] = useState(false);
  const [teacherPicked, setTeacherPicked] = useState(false);
  const [lessonPicked, setLessonPicked] = useState(false);
  const [tab, setTab] = useState<"attended" | "all">("all");
  const [roster, setRoster] = useState<EmuCounterStudent[]>(EMU_ROSTER);
  const [armedFor, setArmedFor] = useState<string | null>(null);
  const [settleArmed, setSettleArmed] = useState(false);
  const [settled, setSettled] = useState(false);
  const [revenue, setRevenue] = useState(EMU_REVENUE_OPENING);
  const [receipts, setReceipts] = useState<EmuReceipt[]>(EMU_RECEIPTS_OPENING);
  const [screenOverride, setScreenOverride] = useState<EmuScreen | null>(null);

  const finished = index >= FLAT_STEPS.length;
  const step = FLAT_STEPS[Math.min(index, FLAT_STEPS.length - 1)]!;
  const screen: EmuScreen = screenOverride ?? step.screen;

  useEffect(() => {
    try {
      const n = Number(window.localStorage.getItem(PROGRESS_KEY) ?? 0);
      if (Number.isFinite(n) && n > 0) setIndex(Math.min(n, FLAT_STEPS.length));
    } catch {
      /* storage disabled — starting from the beginning is the right fallback */
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(PROGRESS_KEY, String(index));
    } catch {
      /* progress simply is not remembered */
    }
  }, [index]);

  useEffect(() => {
    const root = stageRef.current;
    if (!root) return;
    const lit = root.querySelectorAll(`.${styles.lit}`);
    lit.forEach((el) => el.classList.remove(styles.lit!));
    if (finished || !step.spotlight) return;
    const el = root.querySelector(`[data-emu-region="${step.spotlight}"]`);
    el?.classList.add(styles.lit!);
  }, [
    finished,
    step.spotlight,
    screen,
    classOpen,
    priced,
    lessonPicked,
    tab,
    roster,
    settled,
    receipts,
    index,
  ]);

  const advance = useCallback(() => {
    setMissed(false);
    setScreenOverride(null);
    setIndex((i) => i + 1);
  }, []);

  const back = useCallback(() => {
    setMissed(false);
    setScreenOverride(null);
    setIndex((i) => Math.max(0, i - 1));
  }, []);

  const collect = (id: string) => {
    setArmedFor(null);
    setRoster((rows) =>
      rows.map((s) => (s.id === id ? { ...s, covered: true, checkedIn: true } : s)),
    );
    setReceipts((rows) => [
      ...rows,
      {
        id: "r3",
        no: "RCP-NILE-2026-00016",
        student: roster.find((s) => s.id === id)?.name ?? { ar: "طالب", en: "Student" },
        amount: EMU_SESSION_PRICE,
        kind: "payment",
      },
    ]);
  };

  const checkIn = (id: string) =>
    setRoster((rows) => rows.map((s) => (s.id === id ? { ...s, checkedIn: true } : s)));

  const settle = () => {
    const present = roster.filter((s) => s.checkedIn).length;
    setSettled(true);
    setSettleArmed(false);
    setRevenue((r) => r + present * EMU_SPLIT.centre);
  };

  const refund = (id: string) => {
    const original = receipts.find((r) => r.id === id);
    if (!original) return;
    setReceipts((rows) => [
      ...rows,
      {
        id: `${id}-rev`,
        no: `${original.no}-R`,
        student: original.student,
        amount: original.amount,
        kind: "refund",
      },
    ]);
    setRevenue((r) => Math.max(0, r - EMU_SPLIT.centre));
  };

  const restart = () => {
    setIndex(0);
    setMissed(false);
    setClassOpen(false);
    setPriced(false);
    setTeacherPicked(false);
    setLessonPicked(false);
    setTab("all");
    setRoster(EMU_ROSTER);
    setArmedFor(null);
    setSettleArmed(false);
    setSettled(false);
    setRevenue(EMU_REVENUE_OPENING);
    setReceipts(EMU_RECEIPTS_OPENING);
    setScreenOverride(null);
  };

  const ctx = useMemo(
    () => ({
      target: finished ? null : (step.target ?? null),
      onHit: () => advance(),
      onMiss: () => setMissed(true),
    }),
    [finished, step.target, advance],
  );

  const done = Math.min(index, FLAT_STEPS.length);

  return (
    <div className="space-y-4">
      <Sheet className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <Eyebrow>{t("eyebrow")}</Eyebrow>
            <h1 className="mt-1 text-lg font-semibold" style={{ color: "var(--ink)" }}>
              {t("title")}
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs" style={{ color: "var(--ink-3)" }}>
              {t("progress", { done, total: FLAT_STEPS.length })}
            </span>
            <LedgerButton onClick={restart}>
              <RotateCcw className="size-3.5" aria-hidden /> {t("restart")}
            </LedgerButton>
            <LedgerButton onClick={() => onDone?.()}>{t("skip")}</LedgerButton>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {MISSIONS.map((m, mi) => {
            const Icon = ICON[m.icon];
            const passed = finished || mi < step.missionIndex;
            const current = !finished && mi === step.missionIndex;
            return (
              <span
                key={m.id}
                className="inline-flex items-center gap-1.5 rounded-(--radius-badge) px-2.5 py-1 text-xs font-medium"
                style={{
                  border: `1px solid ${current ? "var(--indigo)" : "var(--rule)"}`,
                  color: passed ? "var(--teal)" : current ? "var(--indigo)" : "var(--ink-3)",
                  background: current ? "var(--indigo-soft)" : "transparent",
                }}
              >
                {passed ? (
                  <Check className="size-3.5" aria-hidden />
                ) : (
                  <Icon className="size-3.5" aria-hidden />
                )}
                {t(asKey(`missions.${m.id}`))}
              </span>
            );
          })}
        </div>
      </Sheet>
      {finished ? (
        <Sheet className="p-6 text-center">
          <h2 className="text-xl font-semibold" style={{ color: "var(--ink)" }}>
            {t("finishedTitle")}
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm" style={{ color: "var(--ink-2)" }}>
            {t("finishedBody")}
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <LedgerButton variant="primary" onClick={() => onDone?.()}>
              {t("finishCta")}
            </LedgerButton>
            <LedgerButton onClick={restart}>
              <RotateCcw className="size-3.5" aria-hidden /> {t("restart")}
            </LedgerButton>
          </div>
        </Sheet>
      ) : (
        <Sheet className="p-4" style={{ borderColor: "var(--indigo)" }}>
          <Eyebrow>{t("stepEyebrow", { n: step.indexInMission + 1 })}</Eyebrow>
          <p className="mt-1 font-semibold" style={{ color: "var(--ink)" }}>
            {t(asKey(`steps.${step.id}.title`))}
          </p>
          <p className="mt-1 text-sm" style={{ color: "var(--ink-2)" }}>
            {t(asKey(`steps.${step.id}.body`))}
          </p>
          {missed ? (
            <p className="mt-2 text-sm" style={{ color: "var(--amber)" }} role="status">
              {t("missHint")}
            </p>
          ) : null}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {!step.target ? (
              <LedgerButton variant="primary" onClick={advance}>
                {t("gotIt")} <ChevronRight className="size-3.5 rtl:-scale-x-100" aria-hidden />
              </LedgerButton>
            ) : null}
            {index > 0 ? <LedgerButton onClick={back}>{t("back")}</LedgerButton> : null}
          </div>
        </Sheet>
      )}
      <div
        ref={stageRef}
        className="overflow-hidden rounded-(--radius-step-lg)"
        style={{ border: "1px solid var(--rule)", background: "var(--paper)" }}
      >
        <EmuTargetProvider value={ctx}>
          <div className="grid gap-0 md:grid-cols-[12rem_1fr]">
            <EmuNav screen={screen} onNavigate={(s) => setScreenOverride(s)} />
            <div className="min-h-104 p-4 md:p-5">
              {screen === "dashboard" ? (
                <EmuCentreDashboard revenue={revenue} />
              ) : screen === "classes" ? (
                <EmuCentreClasses
                  open={classOpen}
                  priced={priced}
                  onOpen={() => setClassOpen(true)}
                  onSetPrice={() => setPriced(true)}
                />
              ) : screen === "counter" ? (
                <EmuCentreCounter
                  teacherPicked={teacherPicked}
                  lessonPicked={lessonPicked}
                  tab={tab}
                  roster={roster}
                  priced={priced}
                  armedFor={armedFor}
                  settled={settled}
                  settleArmed={settleArmed}
                  onPickTeacher={() => setTeacherPicked(true)}
                  onPickLesson={() => setLessonPicked(true)}
                  onTab={setTab}
                  onArmCollect={setArmedFor}
                  onCollect={collect}
                  onCheckIn={checkIn}
                  onArmSettle={() => setSettleArmed(true)}
                  onSettle={settle}
                />
              ) : (
                <EmuCentreBooks revenue={revenue} receipts={receipts} onRefund={refund} />
              )}
            </div>
          </div>
        </EmuTargetProvider>
      </div>
      <p className="text-center text-xs" style={{ color: "var(--ink-3)" }}>
        {t("sandboxNote")}
      </p>
    </div>
  );
}

function EmuNav({
  screen,
  onNavigate,
}: {
  screen: EmuScreen;
  onNavigate: (s: EmuScreen) => void;
}) {
  const t = useTranslations("adminHome.centerEmulator");
  const items = [
    { id: "nav-home", to: "dashboard" as const, icon: "home" as const, label: t("nav.dashboard") },
    { id: "nav-classes", to: "classes" as const, icon: "book" as const, label: t("nav.classes") },
    { id: "nav-counter", to: "counter" as const, icon: "counter" as const, label: t("nav.counter") },
    { id: "nav-books", to: "books" as const, icon: "ledger" as const, label: t("nav.books") },
  ];

  return (
    <nav
      className="flex gap-1 overflow-x-auto border-b p-2 md:flex-col md:overflow-visible md:border-b-0 md:border-e"
      style={{ borderColor: "var(--rule-2)", background: "var(--sheet)" }}
      aria-label={t("nav.label")}
    >
      {items.map((it) => {
        const Icon = ICON[it.icon];
        const active = it.to === screen;
        return (
          <EmuTarget key={it.id} id={it.id} onClick={() => onNavigate(it.to)}>
            <span
              className="inline-flex w-full items-center gap-2 whitespace-nowrap rounded-(--radius-step-md) px-3 py-2 text-sm"
              style={{
                background: active ? "var(--indigo-soft)" : "transparent",
                color: active ? "var(--indigo)" : "var(--ink-2)",
                fontWeight: active ? 600 : 400,
              }}
            >
              <Icon className="size-4" aria-hidden />
              {it.label}
            </span>
          </EmuTarget>
        );
      })}
    </nav>
  );
}
