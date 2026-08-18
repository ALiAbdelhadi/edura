"use client";

import { useEffect, useState } from "react";
import { useCustom, useCustomMutation } from "@refinedev/core";
import { DoorOpen } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@repo/ui/components/button";
import { SectionHead } from "@repo/ui/components/ledger";
import { toast } from "@repo/ui/components/sonner";
import { Spinner } from "@/components/kit/spinner";

/** Teacher-only: the global attendance mode (Step 6, approved decision #4). */
export function AttendanceModeCard() {
  const t = useTranslations();
  const { query, result } = useCustom({ url: "teacher/attendance-mode", method: "get" });
  const { mutateAsync: save } = useCustomMutation();
  const [mode, setMode] = useState<"counter_only" | "counter_and_door" | null>(null);
  const [saving, setSaving] = useState(false);

  const serverMode = ((result as any)?.data?.attendanceMode ??
    (result as any)?.attendanceMode) as "counter_only" | "counter_and_door" | undefined;

  useEffect(() => {
    if (serverMode) setMode(serverMode);
  }, [serverMode]);

  const pick = async (next: "counter_only" | "counter_and_door") => {
    setMode(next);
    setSaving(true);
    try {
      await save({ url: "teacher/attendance-mode", method: "patch", values: { mode: next } });
      toast.success(t("teacher.attendanceModeSaved"));
      query.refetch();
    } catch (err: any) {
      toast.error(err?.message || t("teacher.attendanceModeFailed"));
      setMode(serverMode ?? "counter_only");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="flex flex-col gap-3">
      <SectionHead
        title={
          <span className="flex items-center gap-2">
            <DoorOpen className="size-4" aria-hidden />
            {t("teacher.attendanceModeTitle")}
          </span>
        }
      />
      <div className="rounded-xl border border-rule bg-sheet p-4">
        <div className="flex flex-col gap-2">
          <Button
            type="button"
            variant={mode === "counter_only" ? "default" : "outline"}
            disabled={saving}
            onClick={() => pick("counter_only")}
            className="justify-start"
          >
            {saving && mode === "counter_only" ? <Spinner /> : null}
            {t("teacher.modeCounterOnly")}
          </Button>
          <p className="text-xs text-ink-2">{t("teacher.modeCounterOnlyDesc")}</p>
          <Button
            type="button"
            variant={mode === "counter_and_door" ? "default" : "outline"}
            disabled={saving}
            onClick={() => pick("counter_and_door")}
            className="justify-start"
          >
            {saving && mode === "counter_and_door" ? <Spinner /> : null}
            {t("teacher.modeCounterAndDoor")}
          </Button>
          <p className="text-xs text-ink-2">{t("teacher.modeCounterAndDoorDesc")}</p>
        </div>
      </div>
    </section>
  );
}
