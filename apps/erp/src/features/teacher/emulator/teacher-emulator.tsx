"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  BookOpen,
  Check,
  ChevronRight,
  ClipboardCheck,
  Coins,
  Home,
  RotateCcw,
  Wallet,
} from "lucide-react";
import { Eyebrow, LedgerButton, Sheet } from "@/components/ledger";
import { asKey } from "@/lib/i18n/keys";
import { EmuTarget, EmuTargetProvider } from "@/features/emulator/target";
import styles from "@/features/emulator/emulator.module.css";
import {
  EmuTeacherAttendance,
  EmuTeacherClasses,
  EmuTeacherDashboard,
  EmuTeacherWallet,
} from "./screens";
import { FLAT_STEPS, MISSIONS, type EmuScreen } from "./script";
import {
  EMU_ROSTER,
  EMU_SPLIT,
  EMU_WALLET_OPENING,
  EMU_WALLET_OPENING_ROWS,
  type EmuAttendance,
  type EmuPayoutRow,
  type EmuPupil,
  type EmuWalletRow,
} from "./world";

const PROGRESS_KEY = "edura.teacherEmulator.step";

const ICON = {
  home: Home,
  book: BookOpen,
  check: ClipboardCheck,
  coins: Coins,
  wallet: Wallet,
} as const;

export function TeacherEmulator({ onDone }: { onDone?: () => void } = {}) {
  const t = useTranslations("teacher.teacherEmulator");
  const stageRef = useRef<HTMLDivElement>(null);

  const [index, setIndex] = useState(0);
  const [missed, setMissed] = useState(false);

  const [classOpen, setClassOpen] = useState(false);
  const [priced, setPriced] = useState(false);
  const [lessonOpen, setLessonOpen] = useState(false);
  const [roster, setRoster] = useState<EmuPupil[]>(EMU_ROSTER);
  const [saved, setSaved] = useState(false);
  const [armed, setArmed] = useState(false);
  const [settled, setSettled] = useState(false);
  const [balance, setBalance] = useState(EMU_WALLET_OPENING);
  const [reserved, setReserved] = useState(0);
  const [walletRows, setWalletRows] = useState<EmuWalletRow[]>(EMU_WALLET_OPENING_ROWS);
  const [requests, setRequests] = useState<EmuPayoutRow[]>([]);
  const [withdrawArmed, setWithdrawArmed] = useState(false);
  const [screenOverride, setScreenOverride] = useState<EmuScreen | null>(null);

  const finished = index >= FLAT_STEPS.length;
  const step = FLAT_STEPS[Math.min(index, FLAT_STEPS.length - 1)]!;
  const screen: EmuScreen = screenOverride ?? step.screen;

  useEffect(() => {
    try {
      const n = Number(window.localStorage.getItem(PROGRESS_KEY) ?? 0);
      if (Number.isFinite(n) && n > 0) setIndex(Math.min(n, FLAT_STEPS.length));
    } catch {
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(PROGRESS_KEY, String(index));
    } catch {
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
  }, [finished, step.spotlight, screen, classOpen, priced, lessonOpen, saved, settled, index]);

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

  const setStatus = (id: string, status: EmuAttendance) =>
    setRoster((rows) => rows.map((p) => (p.id === id ? { ...p, status } : p)));

  const settle = () => {
    const present = roster.filter((p) => p.status === "present").length;
    const total = present * EMU_SPLIT.teacher;
    setSettled(true);
    setArmed(false);
    setBalance((b) => b + total);
    setWalletRows((rows) => [
      ...rows,
      {
        id: `w${rows.length + 1}`,
        date: t("screens.todayShort"),
        kind: "payment",
        ref: `TRX-${1500 + rows.length * 11}`,
        amount: total,
      },
    ]);
  };

  const armWithdraw = () => {
    if (Math.max(0, balance - reserved) <= 0) return;
    setWithdrawArmed(true);
  };

  const withdraw = () => {
    const amount = Math.max(0, balance - reserved);
    if (amount <= 0) return;
    setWithdrawArmed(false);
    setReserved((r) => r + amount);
    setRequests((rows) => [
      ...rows,
      { id: `r${rows.length + 1}`, amount, status: "pending", requested: t("screens.todayShort") },
    ]);
  };

  const restart = () => {
    setIndex(0);
    setMissed(false);
    setClassOpen(false);
    setPriced(false);
    setLessonOpen(false);
    setRoster(EMU_ROSTER);
    setWithdrawArmed(false);
    setSaved(false);
    setArmed(false);
    setSettled(false);
    setBalance(EMU_WALLET_OPENING);
    setReserved(0);
    setWalletRows(EMU_WALLET_OPENING_ROWS);
    setRequests([]);
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
            <div className="min-h-[26rem] p-4 md:p-5">
              {screen === "dashboard" ? (
                <EmuTeacherDashboard />
              ) : screen === "classes" ? (
                <EmuTeacherClasses
                  open={classOpen}
                  priced={priced}
                  onOpen={() => setClassOpen(true)}
                  onSetPrice={() => setPriced(true)}
                />
              ) : screen === "attendance" ? (
                <EmuTeacherAttendance
                  lessonOpen={lessonOpen}
                  roster={roster}
                  saved={saved}
                  priced={priced}
                  settled={settled}
                  armed={armed}
                  onOpenLesson={() => setLessonOpen(true)}
                  onSetStatus={setStatus}
                  onSave={() => setSaved(true)}
                  onArm={() => setArmed(true)}
                  onSettle={settle}
                />
              ) : (
                <EmuTeacherWallet
                  balance={balance}
                  reserved={reserved}
                  armed={withdrawArmed}
                  onArm={armWithdraw}
                  rows={walletRows}
                  requests={requests}
                  onWithdraw={withdraw}
                />
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
  const t = useTranslations("teacher.teacherEmulator");
  const items = [
    { id: "nav-home", to: "dashboard" as const, icon: "home" as const, label: t("nav.dashboard") },
    { id: "nav-classes", to: "classes" as const, icon: "book" as const, label: t("nav.classes") },
    {
      id: "nav-attendance",
      to: "attendance" as const,
      icon: "check" as const,
      label: t("nav.attendance"),
    },
    { id: "nav-wallet", to: "wallet" as const, icon: "wallet" as const, label: t("nav.wallet") },
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
