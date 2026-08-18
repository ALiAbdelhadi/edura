"use client";

/**
 * The parent emulator's simulated screens.
 *
 * Built from the REAL Ledger primitives (`@/components/ledger`) rather than
 * look-alike markup, so what the parent practises on is the product's own
 * visual language. When the design changes, these change with it.
 *
 * Every interactive control carries a `data-emu` id and every explainable
 * region a `data-emu-region`. That is the only contract between a screen and
 * the engine: screens know nothing about steps.
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
import { EmuTarget } from "@/features/emulator/target";
import {
  EMU_CHILDREN,
  EMU_LESSON,
  EMU_SUBJECT,
  EMU_THREAD,
  pick,
  type EmuWalletRow,
} from "./world";

/* ── Dashboard ─────────────────────────────────────────────────────────── */

export function EmuDashboard() {
  const t = useTranslations("parentEmulator");
  const locale = useLocale() as Locale;
  const child = EMU_CHILDREN[0]!;

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold" style={{ color: "var(--ink)" }}>
        {t("screens.dashboardTitle")}
      </h2>

      <div data-emu-region="children">
        <Sheet className="p-4">
          <Eyebrow>{t("screens.myChildren")}</Eyebrow>
          <ul className="mt-2 space-y-2">
            {EMU_CHILDREN.map((c) => (
              <li key={c.id} className="flex items-center gap-3">
                <InitialsTile name={pick(c.name, locale)} size={36} tone="indigo" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium" style={{ color: "var(--ink)" }}>
                    {pick(c.name, locale)}
                  </p>
                  <p className="text-xs" style={{ color: "var(--ink-2)" }}>
                    {pick(c.grade, locale)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </Sheet>
      </div>

      <div data-emu-region="record" className="grid grid-cols-2 gap-3">
        <Sheet className="p-4">
          <Eyebrow>{pick(child.name, locale)}</Eyebrow>
          <p className="mt-1 text-sm" style={{ color: "var(--ink-2)" }}>
            {t("screens.attendanceRate")}
          </p>
          <Num style={{ fontSize: 26, fontWeight: 600, color: "var(--ink)" }}>
            {formatPercent(child.attendanceRate, locale)}
          </Num>
        </Sheet>
        <Sheet className="p-4">
          <Eyebrow>{pick(child.name, locale)}</Eyebrow>
          <p className="mt-1 text-sm" style={{ color: "var(--ink-2)" }}>
            {t("screens.averageGrade")}
          </p>
          <Num style={{ fontSize: 26, fontWeight: 600, color: "var(--ink)" }}>
            {formatPercent(child.averagePercent, locale)}
          </Num>
        </Sheet>
      </div>
    </div>
  );
}

/* ── Children / linking ────────────────────────────────────────────────── */

export function EmuChildren({ linked, onLink }: { linked: boolean; onLink: () => void }) {
  const t = useTranslations("parentEmulator");
  const locale = useLocale() as Locale;
  const newChild = EMU_CHILDREN[1]!;

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold" style={{ color: "var(--ink)" }}>
        {t("screens.childrenTitle")}
      </h2>

      <div data-emu-region="link-box">
        <Sheet className="p-4">
          <SectionHeading eyebrow={t("screens.linkEyebrow")} title={t("screens.linkChild")} />

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="rounded-(--radius-step-md) p-3" style={{ border: "1px solid var(--rule)" }}>
              <p className="text-sm font-medium" style={{ color: "var(--ink)" }}>
                {t("screens.byFamilyCode")}
              </p>
              <p className="mt-1 text-xs" style={{ color: "var(--ink-2)" }}>
                {t("screens.byFamilyCodeHint")}
              </p>
              <div
                className="mt-2 rounded-(--radius-step-sm) px-3 py-2"
                style={{ background: "var(--field)", border: "1px solid var(--rule)" }}
              >
                <Num style={{ letterSpacing: "0.14em", color: "var(--ink)" }}>4F2A9C</Num>
              </div>
              <div className="mt-2">
                {linked ? (
                  <Chip tone="teal">{t("screens.linked")}</Chip>
                ) : (
                  <EmuTarget id="link-by-code" onClick={onLink}>
                    <span
                      className="inline-flex items-center rounded-(--radius-step-md) px-3 py-2 text-sm font-semibold"
                      style={{
                        background: "var(--indigo)",
                        color: "var(--indigo-ink)",
                        border: "1px solid var(--indigo)",
                      }}
                    >
                      {t("screens.linkInstantly")}
                    </span>
                  </EmuTarget>
                )}
              </div>
            </div>

            <div className="rounded-(--radius-step-md) p-3" style={{ border: "1px solid var(--rule)" }}>
              <p className="text-sm font-medium" style={{ color: "var(--ink)" }}>
                {t("screens.byEmailOrPhone")}
              </p>
              <p className="mt-1 text-xs" style={{ color: "var(--ink-2)" }}>
                {t("screens.byEmailOrPhoneHint")}
              </p>
            </div>
          </div>
        </Sheet>
      </div>

      <Sheet className="p-4">
        <SectionHeading eyebrow={t("screens.linkedEyebrow")} title={t("screens.myChildren")} />
        <ul className="mt-2 space-y-2">
          {(linked ? EMU_CHILDREN : [EMU_CHILDREN[0]!]).map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-3">
              <span className="flex min-w-0 items-center gap-3">
                <InitialsTile name={pick(c.name, locale)} size={32} tone="indigo" />
                <span className="min-w-0">
                  <span className="block truncate text-sm" style={{ color: "var(--ink)" }}>
                    {pick(c.name, locale)}
                  </span>
                  <span className="block text-xs" style={{ color: "var(--ink-2)" }}>
                    {pick(c.grade, locale)}
                  </span>
                </span>
              </span>
              <Chip tone="teal">{t("screens.approved")}</Chip>
            </li>
          ))}
          {linked ? null : (
            <li className="text-xs" style={{ color: "var(--ink-3)" }}>
              {t("screens.notLinkedYet", { name: pick(newChild.name, locale) })}
            </li>
          )}
        </ul>
      </Sheet>
    </div>
  );
}

/* ── Wallet ────────────────────────────────────────────────────────────── */

export function EmuWallet({
  balance,
  rows,
  onTopUp,
}: {
  balance: number;
  rows: EmuWalletRow[];
  onTopUp: () => void;
}) {
  const t = useTranslations("parentEmulator");
  const locale = useLocale() as Locale;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xl font-semibold" style={{ color: "var(--ink)" }}>
          {t("screens.walletTitle")}
        </h2>
        <EmuTarget id="topup" onClick={onTopUp}>
          <span
            className="inline-flex items-center rounded-(--radius-step-md) px-3 py-2 text-sm font-semibold"
            style={{
              background: "var(--indigo)",
              color: "var(--indigo-ink)",
              border: "1px solid var(--indigo)",
            }}
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
            {rows.map((r) => (
              <li
                key={r.id}
                className="flex items-center justify-between gap-3 border-b py-2 last:border-b-0"
                style={{ borderColor: "var(--rule-2)" }}
              >
                <span className="min-w-0">
                  <span className="block text-sm" style={{ color: "var(--ink)" }}>
                    {t(r.kind === "topup" ? "screens.kindTopUp" : "screens.kindPayment")}
                  </span>
                  {/* The column a parent ledger has and a student's does not. */}
                  <span className="block text-xs" style={{ color: "var(--ink-3)" }}>
                    {r.child ? pick(r.child, locale) : t("screens.noChild")}
                    {" · "}
                    <Num>{r.date}</Num>
                  </span>
                </span>
                <Money piasters={r.kind === "topup" ? r.amount : -r.amount} signed />
              </li>
            ))}
          </ul>
        </Sheet>
      </div>
    </div>
  );
}

/* ── Pay for a lesson ──────────────────────────────────────────────────── */

export function EmuPay({
  balance,
  confirming,
  paid,
  onOpenConfirm,
  onPayFromWallet,
}: {
  balance: number;
  confirming: boolean;
  paid: boolean;
  onOpenConfirm: () => void;
  onPayFromWallet: () => void;
}) {
  const t = useTranslations("parentEmulator");
  const locale = useLocale() as Locale;
  const child = EMU_CHILDREN[0]!;
  const enough = balance >= EMU_LESSON.pricePerSession;

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold" style={{ color: "var(--ink)" }}>
        {t("screens.payTitle")}
      </h2>
      <p className="text-sm" style={{ color: "var(--ink-2)" }}>
        {t("screens.payFor", { name: pick(child.name, locale) })}
      </p>

      <div data-emu-region="lesson">
        <Sheet className="p-4">
          <Eyebrow>{pick(EMU_SUBJECT, locale)}</Eyebrow>
          <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-medium" style={{ color: "var(--ink)" }}>
                {pick(EMU_LESSON.teacher, locale)}
              </p>
              <p className="mt-0.5 text-xs" style={{ color: "var(--ink-2)" }}>
                {pick(EMU_LESSON.when, locale)}
              </p>
              <p className="mt-0.5 text-xs" style={{ color: "var(--ink-3)" }}>
                {pick(EMU_LESSON.center, locale)}
              </p>
            </div>
            <div className="shrink-0">
              {paid ? (
                <Chip tone="teal">{t("screens.activated")}</Chip>
              ) : (
                <EmuTarget id="pay-lesson" onClick={onOpenConfirm}>
                  <span
                    className="inline-flex items-center gap-2 rounded-(--radius-step-md) px-3 py-2 text-sm font-semibold"
                    style={{
                      background: "var(--indigo)",
                      color: "var(--indigo-ink)",
                      border: "1px solid var(--indigo)",
                    }}
                  >
                    {t("screens.payLesson")} · <Money piasters={EMU_LESSON.pricePerSession} tone="ink" />
                  </span>
                </EmuTarget>
              )}
            </div>
          </div>
        </Sheet>
      </div>

      {confirming && !paid ? (
        <Sheet className="p-4" style={{ borderColor: "var(--indigo)" }}>
          <Eyebrow>{t("screens.confirmTitle")}</Eyebrow>
          <p className="mt-1 text-sm" style={{ color: "var(--ink-2)" }}>
            {t("screens.confirmBody", { name: pick(child.name, locale) })}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <EmuTarget id="pay-from-wallet" onClick={onPayFromWallet}>
              <span
                className="inline-flex items-center rounded-(--radius-step-md) px-3 py-2 text-sm font-semibold"
                style={{
                  background: "var(--indigo)",
                  color: "var(--indigo-ink)",
                  border: "1px solid var(--indigo)",
                }}
              >
                {t("screens.payFromWallet")}
              </span>
            </EmuTarget>
            <span
              className="inline-flex items-center rounded-(--radius-step-md) px-3 py-2 text-sm"
              style={{ border: "1px solid var(--rule)", color: "var(--ink-2)" }}
            >
              {t("screens.payByCard")}
            </span>
          </div>
          {!enough ? (
            <p className="mt-2 text-sm" style={{ color: "var(--amber)" }}>
              {t("screens.insufficient")}
            </p>
          ) : null}
        </Sheet>
      ) : null}
    </div>
  );
}

/* ── Child safety / oversight ──────────────────────────────────────────── */

export function EmuOversight() {
  const t = useTranslations("parentEmulator");
  const locale = useLocale() as Locale;
  const child = EMU_CHILDREN[0]!;

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold" style={{ color: "var(--ink)" }}>
        {t("screens.safetyTitle")}
      </h2>

      <div data-emu-region="notice">
        <Sheet className="p-4" style={{ borderColor: "var(--indigo)" }}>
          <Eyebrow>{t("screens.readOnlyEyebrow")}</Eyebrow>
          <p className="mt-1 text-sm" style={{ color: "var(--ink-2)" }}>
            {t("screens.readOnlyNotice")}
          </p>
        </Sheet>
      </div>

      <Sheet className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <SectionHeading
            eyebrow={pick(child.name, locale)}
            title={pick(EMU_THREAD.with, locale)}
          />
          <Chip tone="amber">{t("screens.minorBadge")}</Chip>
        </div>

        <ul className="mt-3 space-y-2">
          {EMU_THREAD.messages.map((m) => (
            <li
              key={m.id}
              className="rounded-(--radius-step-md) p-3"
              style={{
                background: m.fromChild ? "var(--indigo-soft)" : "var(--field)",
                border: "1px solid var(--rule-2)",
              }}
            >
              <p className="text-sm" style={{ color: "var(--ink)" }}>
                {pick(m.text, locale)}
              </p>
              <p className="mt-1 text-xs" style={{ color: "var(--ink-3)" }}>
                {m.fromChild ? pick(child.name, locale) : pick(EMU_THREAD.with, locale)} ·{" "}
                <Num>{m.at}</Num>
              </p>
            </li>
          ))}
        </ul>

        {/* There is no composer, and that absence is the feature: parent
            oversight has no write path in the real product either. */}
        <p className="mt-3 text-xs" style={{ color: "var(--ink-3)" }}>
          {t("screens.noReply")}
        </p>
      </Sheet>
    </div>
  );
}
