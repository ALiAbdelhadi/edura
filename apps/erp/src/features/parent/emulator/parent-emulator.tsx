"use client";

/**
 * «جرّب بنفسك» — the parent emulator.
 *
 * A working copy of Edura, populated with a fake family, that walks a
 * first-time parent through the five things they must be able to do: read how
 * their child is doing, LINK a child, top up their own wallet, pay for a
 * lesson, and understand exactly what child-safety oversight does and does not
 * let them see. They PERFORM each one; nothing here is a video or a slideshow.
 *
 * FOUR PROPERTIES THAT ARE THE WHOLE POINT
 *
 *  1. IT TOUCHES NOTHING. No fetch, no mutation, no money, no writes. Every
 *     figure is React state over `world.ts`. That is what makes it safe to hand
 *     someone a button reading «ادفع من محفظتي» and let them press it — and it
 *     is why this works on day one, when a parent has no linked child and every
 *     real screen in their portal is an empty state.
 *  2. THE LEARNER ACTS. A step with a `target` does not advance until that
 *     control is pressed. Pressing the wrong one nudges rather than failing.
 *  3. IT IS SKIPPABLE AND REVERSIBLE. Skip and Back are present, per the UX
 *     rule that a forced linear tour is a trap.
 *  4. IT IS RESUMABLE. Progress is in localStorage — a device preference, not a
 *     fact about the account, which is the same split the first-run gate makes.
 *
 * `onDone` is how the first-run gate learns the tour is over (finished OR
 * skipped — both mean "do not open this by itself again"). The gate owns the
 * persistence; this component owns none of it, so the same engine serves the
 * once-only overlay and the permanent /tour page without knowing which it is in.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { CreditCard, Check, Home, RotateCcw, ShieldCheck, Users, Wallet } from "lucide-react";
import { Eyebrow, LedgerButton, Sheet } from "@/components/ledger";
import { asKey } from "@/lib/i18n/keys";
import { EmuTarget, EmuTargetProvider } from "@/features/emulator/target";
import styles from "@/features/emulator/emulator.module.css";
import { EmuChildren, EmuDashboard, EmuOversight, EmuPay, EmuWallet } from "./screens";
import { FLAT_STEPS, MISSIONS, type EmuScreen } from "./script";
import {
  EMU_CHILDREN,
  EMU_LESSON,
  EMU_WALLET_OPENING,
  EMU_WALLET_OPENING_ROWS,
  type EmuWalletRow,
} from "./world";

const PROGRESS_KEY = "edura.parentEmulator.step";
/** 300 EGP — comfortably clears the lesson price without being a round 1000. */
const TOP_UP_AMOUNT = 30000;

const ICON = {
  home: Home,
  users: Users,
  wallet: Wallet,
  card: CreditCard,
  shield: ShieldCheck,
} as const;

export function ParentEmulator({ onDone }: { onDone?: () => void } = {}) {
  const t = useTranslations("parentEmulator");
  const stageRef = useRef<HTMLDivElement>(null);

  const [index, setIndex] = useState(0);
  const [missed, setMissed] = useState(false);

  /* Simulated world — everything the parent's own actions change. */
  const [linked, setLinked] = useState(false);
  const [balance, setBalance] = useState(EMU_WALLET_OPENING);
  const [rows, setRows] = useState<EmuWalletRow[]>(EMU_WALLET_OPENING_ROWS);
  const [confirming, setConfirming] = useState(false);
  const [paid, setPaid] = useState(false);
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

  /* The spotlight: mark the region this step TALKS about, as opposed to the
     control it asks to be pressed (which `EmuTarget` lights itself). Done in an
     effect over the rendered stage because the relationship is "parent's
     current step ↔ an arbitrary descendant", which CSS cannot express and
     prop-drilling would spread across every screen. */
  useEffect(() => {
    const root = stageRef.current;
    if (!root) return;
    root.querySelectorAll(`.${styles.lit}`).forEach((el) => el.classList.remove(styles.lit!));
    if (finished || !step.spotlight) return;
    root.querySelector(`[data-emu-region="${step.spotlight}"]`)?.classList.add(styles.lit!);
  }, [finished, step.spotlight, screen, linked, confirming, paid, index]);

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

  const topUp = () => {
    const next = balance + TOP_UP_AMOUNT;
    setBalance(next);
    setRows((r) => [
      ...r,
      {
        id: `w${r.length + 1}`,
        date: t("screens.todayShort"),
        kind: "topup",
        child: null,
        amount: TOP_UP_AMOUNT,
        balance: next,
      },
    ]);
  };

  const payFromWallet = () => {
    // All-or-nothing, exactly as the real wallet debit is: short balance means
    // the whole thing is refused and NO part of it is taken.
    if (balance < EMU_LESSON.pricePerSession) return;
    const next = balance - EMU_LESSON.pricePerSession;
    setBalance(next);
    setPaid(true);
    setConfirming(false);
    setRows((r) => [
      ...r,
      {
        id: `w${r.length + 1}`,
        date: t("screens.todayShort"),
        kind: "payment",
        child: EMU_CHILDREN[0]!.name,
        amount: EMU_LESSON.pricePerSession,
        balance: next,
      },
    ]);
  };

  const restart = () => {
    setIndex(0);
    setMissed(false);
    setLinked(false);
    setBalance(EMU_WALLET_OPENING);
    setRows(EMU_WALLET_OPENING_ROWS);
    setConfirming(false);
    setPaid(false);
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

  const shown = Math.min(index + 1, FLAT_STEPS.length);

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
          <div className="flex items-center gap-2">
            <span className="text-xs" style={{ color: "var(--ink-3)" }}>
              {t("progress", { done: shown, total: FLAT_STEPS.length })}
            </span>
            <LedgerButton onClick={restart}>
              <RotateCcw className="size-3.5" aria-hidden /> {t("restart")}
            </LedgerButton>
            {/* Skip is a right, not a courtesy: a forced linear tour is the one
                onboarding pattern people reliably resent. */}
            {onDone ? <LedgerButton onClick={() => onDone()}>{t("skip")}</LedgerButton> : null}
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
            {onDone ? (
              <LedgerButton variant="primary" onClick={() => onDone()}>
                {t("close")}
              </LedgerButton>
            ) : null}
            <LedgerButton onClick={restart}>{t("restart")}</LedgerButton>
          </div>
        </Sheet>
      ) : (
        <Sheet className="p-4" style={{ borderColor: "var(--indigo)" }}>
          {/* The mission's name, NOT a step number: the header already counts
              steps, and a second counter numbered within the mission reads as a
              contradiction. */}
          <Eyebrow>{t(asKey(`missions.${step.mission}`))}</Eyebrow>
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

          <div className="mt-3 flex flex-wrap gap-2">
            {/* A step with no target is an explanation, so it needs its own way on. */}
            {!step.target ? (
              <LedgerButton variant="primary" onClick={advance}>
                {t("gotIt")}
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
          <div className="grid gap-0 md:grid-cols-[13rem_1fr]">
            <EmuNav screen={screen} onNavigate={(s) => setScreenOverride(s)} />
            <div className="min-h-[26rem] p-4 md:p-5">
              {screen === "dashboard" ? (
                <EmuDashboard />
              ) : screen === "children" ? (
                <EmuChildren linked={linked} onLink={() => setLinked(true)} />
              ) : screen === "wallet" ? (
                <EmuWallet balance={balance} rows={rows} onTopUp={topUp} />
              ) : screen === "pay" ? (
                <EmuPay
                  balance={balance}
                  confirming={confirming}
                  paid={paid}
                  onOpenConfirm={() => setConfirming(true)}
                  onPayFromWallet={payFromWallet}
                />
              ) : (
                <EmuOversight />
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
  const t = useTranslations("parentEmulator");
  const items = [
    { id: "nav-home", to: "dashboard" as const, icon: "home" as const, label: t("nav.dashboard") },
    { id: "nav-children", to: "children" as const, icon: "users" as const, label: t("nav.children") },
    { id: "nav-wallet", to: "wallet" as const, icon: "wallet" as const, label: t("nav.wallet") },
    { id: "nav-pay", to: "pay" as const, icon: "card" as const, label: t("nav.pay") },
    { id: "nav-oversight", to: "oversight" as const, icon: "shield" as const, label: t("nav.safety") },
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
