"use client";

/**
 * «جرّب بنفسك» — the teacher emulator.
 *
 * A working copy of Edura, populated with a fake teaching day, that walks a
 * first-time teacher through the five things they must be able to do: read
 * their day, price a class, take attendance (including the state that silently
 * costs them money), CLOSE the lesson, and request a payout. They PERFORM each
 * one; nothing here is a video or a slideshow.
 *
 * FOUR PROPERTIES THAT ARE THE WHOLE POINT
 *
 *  1. IT TOUCHES NOTHING. No fetch, no mutation, no money, no writes. Every
 *     figure is React state over `world.ts`. That is what makes it safe to hand
 *     a stranger a button reading "close the lesson and distribute EGP 360" and
 *     let them press it — and it is why this works on day one, when the real
 *     account has no class, no student and no lesson, so a tour of the real
 *     screens would be a tour of empty states.
 *  2. THE LEARNER ACTS. A step with a `target` does not advance until that
 *     control is pressed. Pressing the wrong one nudges rather than failing.
 *  3. IT IS SKIPPABLE AND REVERSIBLE. Skip and Back are present, per the UX
 *     rule that a forced linear tour is a trap; Skip is also what a returning
 *     teacher who already knows the product needs, and denying it is how a
 *     first-run overlay becomes a thing people resent.
 *  4. IT IS RESUMABLE. Progress is in localStorage, so closing the tab does not
 *     restart the lesson — the failure that makes people abandon tours. It is a
 *     preference, not a fact about the business, which is the same reasoning the
 *     student emulator records for its own progress key.
 *
 * `onDone` is how the first-run gate learns the tour is over (finished OR
 * skipped — both mean "do not open this by itself again"). The gate owns the
 * persistence; this component owns none of it, so the same engine serves the
 * once-only overlay and the permanent /tour page without knowing which it is in.
 */

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

  /* Simulated world — everything the teacher's own actions change. */
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
  /* The withdraw is ARMED before it commits, because the real one is. The
     screen this rehearses now uses TwoStepCommit — press once to arm, again to
     send, with the amount on the button and "no cancel after this" underneath.
     An emulator that still took one press would be teaching a ceremony the
     product no longer has. */
  const [withdrawArmed, setWithdrawArmed] = useState(false);
  const [screenOverride, setScreenOverride] = useState<EmuScreen | null>(null);

  const finished = index >= FLAT_STEPS.length;
  const step = FLAT_STEPS[Math.min(index, FLAT_STEPS.length - 1)]!;
  const screen: EmuScreen = screenOverride ?? step.screen;

  /* Resume where they stopped. Clamped: a stored index from a longer earlier
     script must not land past the end and render nothing. */
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

  /* The spotlight: mark the region this step is TALKING about (as opposed to
     the control it asks to be pressed, which `EmuTarget` lights itself). Done
     in an effect over the rendered stage because the relationship is
     "parent's current step ↔ an arbitrary descendant", which CSS cannot
     express and prop-drilling would spread across every screen. */
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

  /* ── The world's own actions ──────────────────────────────────────────── */

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
    // Reserving rather than deducting is the point of the step that follows:
    // "available" drops to zero while "balance" does not move, which is the
    // wallet's most misread pair.
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
      {/* ── Progress ─────────────────────────────────────────────────────── */}
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
            {/* Skip is a right, not a courtesy: a forced linear tour is the one
                thing users are documented to resent. It ends the tour for good,
                which is why the gate treats it exactly like finishing. */}
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

      {/* ── The instruction ──────────────────────────────────────────────── */}
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
            {/* A step with no target is an explanation, so it needs its own way on. */}
            {!step.target ? (
              <LedgerButton variant="primary" onClick={advance}>
                {t("gotIt")} <ChevronRight className="size-3.5 rtl:-scale-x-100" aria-hidden />
              </LedgerButton>
            ) : null}
            {index > 0 ? <LedgerButton onClick={back}>{t("back")}</LedgerButton> : null}
          </div>
        </Sheet>
      )}

      {/* ── The simulation ───────────────────────────────────────────────── */}
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

/* ── The simulation's own sidebar ───────────────────────────────────────── */

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
