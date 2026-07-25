"use client";

import { useEffect, useState } from "react";
import { useCustom, useCustomMutation } from "@refinedev/core";
import { Wallet, Infinity as InfinityIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@repo/ui/components/alert";
import { Button } from "@repo/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import { Input } from "@repo/ui/components/input";
import { toast } from "@repo/ui/components/sonner";
import { PageHeader } from "@/components/kit/page-header";
import { PageSpinner, Spinner } from "@/components/kit/spinner";
import { useFormatters } from "@/lib/i18n/use-formatters";

type WalletPolicy = {
  minTopup: number;
  maxTopup: number;
  updatedAt: string | null;
};

/**
 * Student-wallet policy. The balance cap is GONE (2026-07-23) — a student may
 * hold any balance — so the only knobs left are the per-transaction top-up
 * bounds, which the money engine enforces before taking any money.
 */
export function WalletSettingsScreen() {
  const { formatEGP, formatDate } = useFormatters();

  const { query, result } = useCustom({ url: "admin/wallet-settings", method: "get" });
  const { mutateAsync: save } = useCustomMutation();

  const data = result?.data as WalletPolicy | undefined;

  const [minEgp, setMinEgp] = useState("");
  const [maxEgp, setMaxEgp] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (data) {
      setMinEgp(String(data.minTopup / 100));
      setMaxEgp(String(data.maxTopup / 100));
    }
  }, [data]);

  const submit = async () => {
    const min = Number(minEgp);
    const max = Number(maxEgp);
    if (!Number.isFinite(min) || min <= 0 || !Number.isFinite(max) || max <= 0) {
      toast.error("Both bounds must be positive EGP amounts");
      return;
    }
    if (max < min) {
      toast.error("Maximum top-up cannot be lower than the minimum");
      return;
    }
    setSaving(true);
    try {
      await save({
        url: "admin/wallet-settings",
        method: "put",
        values: { minTopup: Math.round(min * 100), maxTopup: Math.round(max * 100) },
      });
      toast.success("Wallet policy saved — the next top-up uses the new bounds");
      query.refetch();
    } catch (err: any) {
      toast.error(err?.message || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  if (query.isLoading || !data) return <PageSpinner label="Loading wallet policy…" />;

  return (
    <div className="max-w-2xl space-y-6">
      <PageHeader
        title="Student wallet policy"
        description="Bounds on a SINGLE top-up, checked server-side before any money is taken — online (Paymob) and center cash alike."
      />

      <Alert>
        <InfinityIcon className="size-4" />
        <AlertTitle>No balance cap</AlertTitle>
        <AlertDescription>
          A student can hold any wallet balance. The old 500 EGP ceiling was
          removed on 2026-07-23; these bounds are per-transaction only, so a
          student blocked by the maximum can simply top up again.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <span
              aria-hidden
              className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"
            >
              <Wallet className="size-5" />
            </span>
            <div className="space-y-0.5">
              <CardTitle>Top-up bounds</CardTitle>
              <CardDescription>
                Applied to every student on every top-up channel.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="min-topup" className="mb-1 block text-sm font-medium">
                Minimum top-up (EGP)
              </label>
              <Input
                id="min-topup"
                type="number"
                min="0"
                step="0.01"
                value={minEgp}
                onChange={(e) => setMinEgp(e.target.value)}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Keeps dust amounts off the payment gateway. Currently{" "}
                {formatEGP(data.minTopup)}.
              </p>
            </div>
            <div>
              <label htmlFor="max-topup" className="mb-1 block text-sm font-medium">
                Maximum top-up (EGP)
              </label>
              <Input
                id="max-topup"
                type="number"
                min="0"
                step="0.01"
                value={maxEgp}
                onChange={(e) => setMaxEgp(e.target.value)}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                A typo guard on a single charge — not a limit on total balance.
                Currently {formatEGP(data.maxTopup)}.
              </p>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Changes apply to the next top-up; intents already created keep the
            amount they were validated at.
            {data.updatedAt ? ` Last changed ${formatDate(data.updatedAt)}.` : ""}
          </p>
          <div className="flex justify-end pt-2">
            <Button onClick={submit} disabled={saving}>
              {saving ? <Spinner /> : null}
              Save settings
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
