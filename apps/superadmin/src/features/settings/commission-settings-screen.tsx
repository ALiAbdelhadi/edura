"use client";

import { useEffect, useState } from "react";
import { useCustom, useCustomMutation } from "@refinedev/core";
import { Percent, Info } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@repo/ui/components/alert";
import { Button } from "@repo/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import { Input } from "@repo/ui/components/input";
import { toast } from "@repo/ui/components/sonner";
import { PageHeader } from "@/components/kit/page-header";
import { PageSpinner, Spinner } from "@/components/kit/spinner";
import { useFormatters } from "@/lib/i18n/use-formatters";

type CommissionData = {
  teacherDirectCommissionBp: number;
  platformTeacherFee: number;
  platformCenterFee: number;
  updatedAt: string | null;
};

/**
 * readOnly=true renders the accountant view: the accountant sees the current
 * commission/fees to understand the numbers they reconcile, but editing is
 * super_admin only (enforced at the API — the finance route has no PUT).
 */
export function CommissionSettingsScreen({ readOnly }: { readOnly: boolean }) {
  const { formatEGP, formatDate } = useFormatters();
  const apiUrl = readOnly ? "finance/commission-settings" : "admin/commission-settings";

  const { query, result } = useCustom({ url: apiUrl, method: "get" });
  const { mutateAsync: save } = useCustomMutation();

  const data = result?.data as CommissionData | undefined;

  const [pct, setPct] = useState("");
  const [teacherFeeEgp, setTeacherFeeEgp] = useState("");
  const [centerFeeEgp, setCenterFeeEgp] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (data) {
      setPct(String(data.teacherDirectCommissionBp / 100));
      setTeacherFeeEgp(String(data.platformTeacherFee / 100));
      setCenterFeeEgp(String(data.platformCenterFee / 100));
    }
  }, [data]);

  const submit = async () => {
    const pctNum = Number(pct);
    const tFee = Number(teacherFeeEgp);
    const cFee = Number(centerFeeEgp);
    if (!Number.isFinite(pctNum) || pctNum < 0 || pctNum > 100) {
      toast.error("Commission must be between 0% and 100%");
      return;
    }
    if (!Number.isFinite(tFee) || tFee < 0 || !Number.isFinite(cFee) || cFee < 0) {
      toast.error("Fees must be non-negative EGP amounts");
      return;
    }
    setSaving(true);
    try {
      await save({
        url: "admin/commission-settings",
        method: "put",
        values: {
          teacherDirectCommissionBp: Math.round(pctNum * 100),
          platformTeacherFee: Math.round(tFee * 100),
          platformCenterFee: Math.round(cFee * 100),
        },
      });
      toast.success("Commission settings saved — new charges use the new rates immediately");
      query.refetch();
    } catch (err: any) {
      toast.error(err?.message || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  if (query.isLoading || !data) return <PageSpinner label="Loading commission settings…" />;

  return (
    <div className="max-w-2xl space-y-6">
      <PageHeader
        title="Platform commission"
        description="Global defaults applied by the money engine. Per-center and per-teacher overrides are a future addition — the resolution order is already teacher > center > global."
      />

      {readOnly ? (
        <Alert>
          <Info className="size-4" />
          <AlertTitle>Read-only</AlertTitle>
          <AlertDescription>
            These are the rates the ledger numbers are built from. Changing them
            is a super-admin action.
          </AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Percent className="size-4" />
            Global defaults
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <div className="mb-1 text-sm font-medium">Teacher-direct commission (%)</div>
            <Input
              type="number"
              min="0"
              max="100"
              step="0.01"
              value={pct}
              disabled={readOnly}
              onChange={(e) => setPct(e.target.value)}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Platform share of every teacher-direct subscription payment (no
              center involved). Applied at charge time; already-settled payments
              keep the rate they were charged at.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <div className="mb-1 text-sm font-medium">Platform fee — teacher side (EGP)</div>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={teacherFeeEgp}
                disabled={readOnly}
                onChange={(e) => setTeacherFeeEgp(e.target.value)}
              />
            </div>
            <div>
              <div className="mb-1 text-sm font-medium">Platform fee — center side (EGP)</div>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={centerFeeEgp}
                disabled={readOnly}
                onChange={(e) => setCenterFeeEgp(e.target.value)}
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Flat per-present-student fees on the center-course session split
            (PRD §5.1 default: {formatEGP(200)} + {formatEGP(200)}).
            {data.updatedAt ? ` Last changed ${formatDate(data.updatedAt)}.` : ""}
          </p>
          {!readOnly ? (
            <Button onClick={submit} disabled={saving}>
              {saving ? <Spinner /> : null}
              Save settings
            </Button>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
