"use client";

/* Phase 2 (revenue-operations spec §2.4) — the drawer session card on the
   counter board.

   The card is the whole shift lifecycle for the person standing at the desk:
   open with a float, watch the live expected-cash figure, close against a
   physical count. It renders figures the server derived from the payments
   stamped with this shift's id — it computes nothing of its own, exactly as
   the shift service computes nothing the ledger does not hold. */

import { api } from "@/lib/api/client";
import { useFormatters } from "@/lib/i18n/use-formatters";
import { postMoney, readApiError, Eyebrow, Computation, Amount, TwoStepCommit } from "../ledger";
import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { toast } from "@repo/ui/components/sonner";
import { cn } from "@repo/ui/lib/utils";
import { Wallet2 } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import type { Locale } from "@repo/ui/lib/format";

type Bucket = { method: string; received: number; refunded: number; net: number; count: number };
type Shift = {
  id: string;
  openedAt: string;
  openingFloat: number;
  expectedCashNow: number;
  buckets: Bucket[];
};

const METHOD_KEYS: Record<string, string> = {
  cash: "shared.checkin.methodCash",
  instapay: "shared.checkin.methodInstapay",
  pos_card: "shared.checkin.methodPosCard",
  mobile_wallet: "shared.checkin.methodMobileWallet",
};

export function ShiftCard() {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  const { formatEGP, formatDate } = useFormatters();

  const [shift, setShift] = useState<Shift | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [closing, setClosing] = useState(false);
  const [floatEgp, setFloatEgp] = useState("");
  const [countedEgp, setCountedEgp] = useState("");
  const [lastVariance, setLastVariance] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await api.get("center/shifts/current").json<{ data: Shift | null }>();
      setShift(res.data);
    } catch {
      setShift(null);
    }
  }, []);
  useEffect(() => void refresh(), [refresh]);

  const open = async () => {
    const egp = floatEgp.trim() === "" ? 0 : Number(floatEgp);
    if (!Number.isFinite(egp) || egp < 0) {
      toast.error(t("shared.shifts.invalidAmount"));
      return;
    }
    setBusy(true);
    try {
      await postMoney("center/shifts", { openingFloat: Math.round(egp * 100) });
      setFloatEgp("");
      setLastVariance(null);
      toast.success(t("shared.shifts.opened"));
      await refresh();
    } catch (err) {
      toast.error((await readApiError(err)).message || t("shared.shifts.failed"));
    } finally {
      setBusy(false);
    }
  };

  const close = async () => {
    if (!shift) return;
    const egp = Number(countedEgp);
    if (!Number.isFinite(egp) || egp < 0) {
      toast.error(t("shared.shifts.invalidAmount"));
      return;
    }
    setBusy(true);
    try {
      const res = await postMoney<{ variance: number }>(`center/shifts/${shift.id}/close`, {
        countedCash: Math.round(egp * 100),
      });
      setLastVariance(res?.variance ?? null);
      setClosing(false);
      setCountedEgp("");
      toast.success(t("shared.shifts.closed"));
      await refresh();
    } catch (err) {
      toast.error((await readApiError(err)).message || t("shared.shifts.failed"));
    } finally {
      setBusy(false);
    }
  };

  if (shift === undefined) return null; // first load — no flicker

  // ---- No open shift: the open strip (+ the last close's variance, if any).
  if (shift === null) {
    return (
      <div className="rounded-xl border border-(--rule) bg-(--sheet) p-3.5">
        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <Eyebrow>{t("shared.shifts.title")}</Eyebrow>
            <p className="m-0 mt-1 text-[13px] text-(--ink-2)">{t("shared.shifts.noneOpen")}</p>
            {lastVariance != null ? (
              <p className={cn("m-0 mt-1 text-[13px] font-medium", lastVariance === 0 ? "text-(--ink-2)" : "text-(--seal)")}>
                {lastVariance === 0
                  ? t("shared.shifts.varianceZero")
                  : t("shared.shifts.varianceResult", { amount: formatEGP(lastVariance, { decimals: true }) })}
              </p>
            ) : null}
          </div>
          <div className="flex items-end gap-2">
            <div>
              <label htmlFor="shift-float" className="mb-1 block text-[12px] text-(--ink-2)">
                {t("shared.shifts.openingFloat")}
              </label>
              <Input
                id="shift-float"
                type="number"
                min={0}
                step="0.01"
                inputMode="decimal"
                dir="ltr"
                className="num h-11 w-32"
                placeholder="0"
                value={floatEgp}
                onChange={(e) => setFloatEgp(e.target.value)}
              />
            </div>
            <Button size="lg" className="h-11" disabled={busy} onClick={() => void open()}>
              <Wallet2 className="size-4" />
              {t("shared.shifts.open")}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ---- Open shift.
  return (
    <div className="rounded-xl border border-(--rule) bg-(--sheet) p-3.5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Eyebrow>{t("shared.shifts.title")}</Eyebrow>
          <p className="m-0 mt-1 text-[13px] text-(--ink-2)">
            {t("shared.shifts.openSince", { time: formatDate(shift.openedAt, { timeStyle: "short" }) })}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-end">
            <span className="block text-[12px] text-(--ink-2)">{t("shared.shifts.expectedCash")}</span>
            <Amount piasters={shift.expectedCashNow} locale={locale} />
          </div>
          {closing ? null : (
            <Button size="lg" variant="outline" className="h-11" disabled={busy} onClick={() => setClosing(true)}>
              {t("shared.shifts.close")}
            </Button>
          )}
        </div>
      </div>

      {closing ? (
        <div className="mt-3 border-t border-(--rule) pt-3">
          <Computation
            lines={[
              { label: t("shared.shifts.openingFloat"), value: <Amount piasters={shift.openingFloat} locale={locale} /> },
              ...shift.buckets
                .filter((b) => b.method !== "wallet")
                .map((b) => ({
                  label: `${t((METHOD_KEYS[b.method] ?? "shared.shifts.methodOther") as never)} (${b.count})`,
                  value: <Amount piasters={b.net} locale={locale} />,
                })),
            ]}
            totalLabel={t("shared.shifts.expectedCash")}
            totalValue={<Amount piasters={shift.expectedCashNow} locale={locale} />}
          />
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="flex-1">
              <label htmlFor="shift-counted" className="mb-1 block text-[12px] text-(--ink-2)">
                {t("shared.shifts.countedCash")}
              </label>
              <Input
                id="shift-counted"
                type="number"
                min={0}
                step="0.01"
                inputMode="decimal"
                dir="ltr"
                className="num h-11"
                placeholder="0"
                value={countedEgp}
                onChange={(e) => setCountedEgp(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <TwoStepCommit
                resetKey={countedEgp}
                label={t("shared.shifts.armClose")}
                armedLabel={t("shared.shifts.confirmClose")}
                busy={busy}
                onCommit={close}
                anchor="viewport-bottom"
              />
              <Button variant="ghost" className="h-11" onClick={() => setClosing(false)}>
                {t("actions.cancel")}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
