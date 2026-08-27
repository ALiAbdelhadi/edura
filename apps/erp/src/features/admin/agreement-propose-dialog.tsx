"use client";

import { Button } from "@repo/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/dialog";
import { Input } from "@repo/ui/components/input";
import { toast } from "@repo/ui/components/sonner";
import { cn } from "@repo/ui/lib/utils";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { postMoney, readApiError } from "./ledger";

type Basis = "percent_of_net" | "fixed_per_student";
type Residual = "teacher" | "center";

export function AgreementProposeDialog({
  teacherId,
  teacherName,
  open,
  onOpenChange,
}: {
  teacherId: string | null;
  teacherName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations();
  const [basis, setBasis] = useState<Basis>("percent_of_net");
  const [residual, setResidual] = useState<Residual>("center");
  const [rate, setRate] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const n = Number(rate);
    const valid =
      basis === "percent_of_net"
        ? Number.isFinite(n) && n >= 0 && n <= 100
        : Number.isFinite(n) && n > 0;
    if (!teacherId || !valid) {
      toast.error(t("adminHome.agreements_invalidRate"));
      return;
    }
    setBusy(true);
    try {
      const res = await postMoney<{ warning: string | null }>("center/teacher-agreements", {
        teacherId,
        basis,
        residual,
        ...(basis === "percent_of_net"
          ? { rateBp: Math.round(n * 100) }
          : { rateFlat: Math.round(n * 100) }),
      });
      toast.success(t("adminHome.agreements_proposed"));
      if (res?.warning) toast.warning(t("adminHome.agreements_roomOnlyWarning"), { duration: 9000 });
      onOpenChange(false);
      setRate("");
    } catch (err) {
      toast.error((await readApiError(err)).message || t("adminHome.agreements_failed"));
    } finally {
      setBusy(false);
    }
  };

  const choice = (
    active: boolean,
    label: string,
    onClick: () => void,
  ) => (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className={cn(
        "h-10 flex-1 rounded-lg border px-2 text-[13px] font-medium transition-colors",
        active
          ? "border-(--ink) bg-(--ink) text-(--paper)"
          : "border-(--rule) bg-(--sheet) text-(--ink-2)",
      )}
    >
      {label}
    </button>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {t("adminHome.agreements_title", { name: teacherName })}
          </DialogTitle>
        </DialogHeader>
        <p className="m-0 text-[12.5px] leading-relaxed text-(--ink-2)">
          {t("adminHome.agreements_hint")}
        </p>
        <div className="flex flex-col gap-3">
          <div>
            <p className="mb-1.5 text-[12.5px] font-medium text-(--ink-2)">
              {t("adminHome.agreements_basis")}
            </p>
            <div className="flex gap-2" role="radiogroup">
              {choice(basis === "percent_of_net", t("adminHome.agreements_percent"), () => setBasis("percent_of_net"))}
              {choice(basis === "fixed_per_student", t("adminHome.agreements_fixed"), () => setBasis("fixed_per_student"))}
            </div>
          </div>
          <div>
            <p className="mb-1.5 text-[12.5px] font-medium text-(--ink-2)">
              {t("adminHome.agreements_residual")}
            </p>
            <div className="flex gap-2" role="radiogroup">
              {choice(residual === "center", t("adminHome.agreements_rateForTeacher"), () => setResidual("center"))}
              {choice(residual === "teacher", t("adminHome.agreements_rateForCenter"), () => setResidual("teacher"))}
            </div>
          </div>
          <div>
            <label htmlFor="agreement-rate" className="mb-1 block text-[12.5px] font-medium text-(--ink-2)">
              {basis === "percent_of_net"
                ? t("adminHome.agreements_ratePercent")
                : t("adminHome.agreements_rateEgp")}
            </label>
            <Input
              id="agreement-rate"
              type="number"
              min={0}
              step="0.01"
              inputMode="decimal"
              dir="ltr"
              className="num"
              placeholder={basis === "percent_of_net" ? "60" : "50"}
              value={rate}
              onChange={(e) => setRate(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("actions.cancel")}
          </Button>
          <Button disabled={busy} onClick={() => void submit()}>
            {t("adminHome.agreements_submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
