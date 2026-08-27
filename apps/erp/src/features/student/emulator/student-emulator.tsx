"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { BookOpen, Check, CreditCard, Home, RotateCcw, Wallet } from "lucide-react";
import { Eyebrow, LedgerButton, Sheet } from "@/components/ledger";
import { asKey } from "@/lib/i18n/keys";
import { EmuTarget, EmuTargetProvider } from "./target";
import { EmuCard, EmuDashboard, EmuSubjects, EmuWallet } from "./screens";
import { FLAT_STEPS, MISSIONS, type EmuScreen } from "./script";
import { EMU_LEDGER_OPENING, EMU_WALLET_OPENING, type EmuLedgerRow } from "./world";
import styles from "@/features/emulator/emulator.module.css";

const PROGRESS_KEY = "edura.studentEmulator.step";
const TOP_UP_AMOUNT = 20000;
const SUBSCRIBE_PRICE = 40000;

const ICON = { home: Home, book: BookOpen, wallet: Wallet, card: CreditCard } as const;

export function StudentEmulator() {
  const t = useTranslations("studentEmulator");
  const stageRef = useRef<HTMLDivElement>(null);

  const [index, setIndex] = useState(0);
  const [missed, setMissed] = useState(false);

  const [openSubject, setOpenSubject] = useState<string | null>(null);
  const [subscribedGroup, setSubscribedGroup] = useState<string | null>(null);
  const [balance, setBalance] = useState(EMU_WALLET_OPENING);
  const [ledger, setLedger] = useState<EmuLedgerRow[]>(EMU_LEDGER_OPENING);
  const [cardShown, setCardShown] = useState(false);
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
  }, [finished, step.spotlight, screen, openSubject, subscribedGroup, cardShown, index]);

  const advance = useCallback(() => {
    setMissed(false);
    setScreenOverride(null);
    setIndex((i) => i + 1);
  }, []);

  const topUp = () => {
    const next = balance + TOP_UP_AMOUNT;
    setBalance(next);
    setLedger((rows) => [
      ...rows,
      {
        id: `l${rows.length + 1}`,
        date: t("screens.todayShort"),
        kind: "topup",
        ref: `TRX-${1000 + rows.length * 7}`,
        amount: TOP_UP_AMOUNT,
        balance: next,
      },
    ]);
  };

  const subscribe = (groupId: string) => {
    setSubscribedGroup(groupId);
    const next = Math.max(0, balance - SUBSCRIBE_PRICE);
    setBalance(next);
    setLedger((rows) => [
      ...rows,
      {
        id: `l${rows.length + 1}`,
        date: t("screens.todayShort"),
        kind: "payment",
        ref: `RCP-${2000 + rows.length * 3}`,
        amount: SUBSCRIBE_PRICE,
        balance: next,
      },
    ]);
  };

  const restart = () => {
    setIndex(0);
    setMissed(false);
    setOpenSubject(null);
    setSubscribedGroup(null);
    setBalance(EMU_WALLET_OPENING);
    setLedger(EMU_LEDGER_OPENING);
    setCardShown(false);
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
      <Sheet className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <Eyebrow>{t("eyebrow")}</Eyebrow>
            <h1 className="mt-1 text-lg font-semibold" style={{ color: "var(--ink)" }}>
              {t("title")}
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs" style={{ color: "var(--ink-3)" }}>
              {t("progress", { done: shown, total: FLAT_STEPS.length })}
            </span>
            <LedgerButton onClick={restart}>
              <RotateCcw className="size-3.5" aria-hidden /> {t("restart")}
            </LedgerButton>
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
          <div className="mt-4 flex justify-center">
            <LedgerButton variant="primary" onClick={restart}>
              {t("restart")}
            </LedgerButton>
          </div>
        </Sheet>
      ) : (
        <Sheet className="p-4" style={{ borderColor: "var(--indigo)" }}>
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

          {!step.target ? (
            <div className="mt-3">
              <LedgerButton variant="primary" onClick={advance}>
                {t("gotIt")}
              </LedgerButton>
            </div>
          ) : null}
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
                <EmuDashboard subscribed={Boolean(subscribedGroup)} />
              ) : screen === "subjects" ? (
                <EmuSubjects
                  openSubject={openSubject}
                  subscribedGroup={subscribedGroup}
                  onOpenSubject={(id) => setOpenSubject((cur) => (cur === id ? null : id))}
                  onSubscribe={subscribe}
                />
              ) : screen === "wallet" ? (
                <EmuWallet balance={balance} ledger={ledger} onTopUp={topUp} />
              ) : (
                <EmuCard shown={cardShown} onShow={() => setCardShown(true)} />
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
  const t = useTranslations("studentEmulator");
  const items = [

    { id: "nav-home", to: "dashboard" as const, icon: "home" as const, label: t("nav.dashboard") },
    { id: "nav-card", to: "card" as const, icon: "card" as const, label: t("nav.card") },
    { id: "nav-subjects", to: "subjects" as const, icon: "book" as const, label: t("nav.subjects") },
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
