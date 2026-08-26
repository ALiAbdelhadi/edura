"use client";

import { PageHeader } from "@/components/kit/page-header";
import { QrScannerButton } from "@/components/kit/qr-scanner-button";
import { Spinner } from "@/components/kit/spinner";
import { StatusBadge } from "@/components/kit/status-badge";
import { api } from "@/lib/api/client";
import { codeFromScan } from "@/lib/attendance/scanned-code";
import { useFormatters } from "@/lib/i18n/use-formatters";
import { enqueueAttendance } from "@/lib/pwa/attendance-outbox";
import { useAttendanceSync } from "@/lib/pwa/use-attendance-sync";
import { useCustomMutation, useGetIdentity } from "@refinedev/core";
import { resolveStudentCode } from "@repo/database/student-code";
import { todayKey } from "@repo/server-core/lib/date-key";
import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { Figure, SectionHead } from "@repo/ui/components/ledger";
import { Num } from "@repo/ui/components/num";
import { Progress } from "@repo/ui/components/progress";
import { toast } from "@repo/ui/components/sonner";
import { cn } from "@repo/ui/lib/utils";
import { CheckCircle2, CloudOff, DoorOpen } from "lucide-react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type DoorRow = {
  studentId: string;
  name: string;
  studentCode: string | null;
  status: string;
  counterAt: string | null;
  doorAt: string | null;
};

type SessionRow = { id: string; courseTitle?: string; startTime: string; endTime: string; date: string };

export function DoorCheckinScreen() {
  const t = useTranslations();
  const { locale } = useFormatters();
  const { mutateAsync: post } = useCustomMutation();
  const { data: identity } = useGetIdentity<{
    id?: string;
    actingTeacherId?: string;
  }>();
  const teacherId = identity?.actingTeacherId ?? identity?.id;
  const { queueCount, isSyncing, flush, refreshCount } =
    useAttendanceSync(teacherId);

  const [sessions, setSessions] = useState<SessionRow[] | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [roster, setRoster] = useState<DoorRow[] | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [counterOnly, setCounterOnly] = useState(false);

  const doorErrorMessage = (err: any) => {
    const status = err?.statusCode ?? err?.response?.status;
    const message: string = err?.message ?? "";
    if (status === 404 || /not found/i.test(message)) return t("shared.door.notFound");
    if (/counter/i.test(message)) return t("shared.door.counterFirst");
    return message || t("shared.door.failed");
  };

  useEffect(() => {
    (async () => {
      try {
        const res = await api
          .get("teacher/attendance-mode")
          .json<{ data: { attendanceMode?: string } }>();
        setCounterOnly(res.data?.attendanceMode === "counter_only");
      } catch {
        setCounterOnly(false);
      }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const today = todayKey();
        const res = await api
          .get(`sessions?from=${today}&to=${today}`)
          .json<{ data: { items?: SessionRow[] } | SessionRow[] }>();
        const items = Array.isArray(res.data) ? res.data : (res.data.items ?? []);
        setSessions(items);
      } catch {
        setSessions([]);
      }
    })();
  }, []);

  const loadRoster = async (sid: string) => {
    setSessionId(sid);
    setRoster(null);
    try {
      const res = await api.get(`door-checkin?sessionId=${sid}`).json<{ data: DoorRow[] }>();
      setRoster(res.data);
    } catch (err: any) {
      toast.error(err?.message || t("shared.door.loadFailed"));
    }
  };

  const handedOff = useRef(false);
  const searchParams = useSearchParams();
  const handedOffCode = codeFromScan(searchParams.get("code") ?? "");
  useEffect(() => {
    if (!handedOffCode || handedOff.current || sessions === null) return;
    handedOff.current = true;
    setCode(handedOffCode);
    const only = sessions.length === 1 ? sessions[0] : null;
    if (only && !sessionId) void loadRoster(only.id);
  }, [handedOffCode, sessions]);

  const findRosterRow = (input: {
    studentId?: string;
    studentCode?: string;
  }): DoorRow | null => {
    if (!roster) return null;
    if (input.studentId)
      return roster.find((r) => r.studentId === input.studentId) ?? null;

    const raw = input.studentCode?.trim();
    if (!raw) return null;
    const code = codeFromScan(raw);
    if (!code) return null;
    return (
      roster.find(
        (r) => r.studentCode && resolveStudentCode(r.studentCode) === code,
      ) ?? null
    );
  };

  const confirmOffline = async (input: {
    studentId?: string;
    studentCode?: string;
  }): Promise<void> => {
    if (!sessionId || !teacherId) return;
    const row = findRosterRow(input);
    if (!row) {
      toast.error(t("shared.door.offlineNotOnList"));
      return;
    }
    if (row.doorAt) {
      toast.info(t("shared.door.doorDone"));
      setCode("");
      return;
    }
    if (!row.counterAt) {
      toast.error(t("shared.door.counterFirst"));
      return;
    }

    await enqueueAttendance(teacherId, sessionId, [
      { studentId: row.studentId, status: "present", stage: "door" },
    ]);
    await refreshCount();
    setRoster(
      (prev) =>
        prev?.map((r) =>
          r.studentId === row.studentId
            ? { ...r, doorAt: new Date().toISOString() }
            : r,
        ) ?? prev,
    );
    setCode("");
    toast.success(t("shared.door.savedOffline", { name: row.name }));
  };

  const handleSyncNow = async () => {
    const result = await flush({ force: true });
    if (result.status === "empty") toast.info(t("teacher.syncNothingToSync"));
    else if (result.status === "offline") toast.warning(t("teacher.syncOffline"));
    else if (result.status === "failed")
      toast.error(result.message || t("teacher.syncFailed"));
    else {
      toast.success(t("teacher.syncedCount", { n: result.synced }));
      const skipped = result.conflicts + result.errors;
      if (skipped > 0) toast.info(t("teacher.skippedCount", { n: skipped }));
      if (sessionId) await loadRoster(sessionId);
    }
  };

  const confirm = async (input: { studentId?: string; studentCode?: string }) => {
    if (!sessionId) return;

    if (typeof navigator !== "undefined" && !navigator.onLine && teacherId) {
      setBusy(true);
      try {
        await confirmOffline(input);
      } finally {
        setBusy(false);
      }
      return;
    }

    setBusy(true);
    try {
      await post({
        url: "door-checkin",
        method: "post",
        values: { ...input, sessionId },
      });
      toast.success(t("shared.door.confirmed"));
      setCode("");
      await loadRoster(sessionId);
    } catch (err: any) {
      toast.error(doorErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const checkedIn = roster?.filter((r) => r.doorAt).length ?? 0;
  const rosterTotal = roster?.length ?? 0;
  const remaining = rosterTotal - checkedIn;
  const progressPct = rosterTotal > 0 ? Math.round((checkedIn / rosterTotal) * 100) : 0;

  return (
    <div className="mx-auto max-w-xl space-y-5">
      <PageHeader title={t("shared.door.title")} description={t("shared.door.description")} />

      {queueCount > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-info/12 px-4 py-3 text-sm text-info">
          <div className="flex items-center gap-2 font-medium">
            <CloudOff className="size-4 shrink-0" />
            {t("teacher.pendingSync", { n: queueCount })}
          </div>
          <Button
            size="sm"
            variant="outline"
            disabled={isSyncing}
            onClick={handleSyncNow}
          >
            {isSyncing && <Spinner />}
            {t("teacher.syncNow")}
          </Button>
        </div>
      )}

      {counterOnly ? (
        <p className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm text-foreground">
          {t("shared.door.counterOnlyNotice")}
        </p>
      ) : null}

      {/* Session selector — a control bar, not a step: switching sessions mid-shift
          must not hide the console the operator is standing in front of. */}
      <div className="flex flex-col gap-2">
        <span className="eyebrow">{t("shared.door.pickSession")}</span>
        {handedOffCode && !sessionId ? (
          <p className="rounded-lg bg-indigo-soft px-3 py-2 text-sm text-ink">
            {t("shared.door.handedOff", { code: handedOffCode })}
          </p>
        ) : null}
        {sessions === null ? (
          <Spinner />
        ) : sessions.length === 0 ? (
          <p className="text-sm text-ink-2">{t("shared.door.noSessions")}</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {sessions.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => loadRoster(s.id)}
                className={cn(
                  "flex items-center gap-2 rounded-full border px-3.5 py-2 text-[13px] font-medium transition-colors",
                  sessionId === s.id
                    ? "border-indigo bg-indigo-soft text-indigo"
                    : "border-rule bg-sheet text-ink-2 hover:text-ink",
                )}
              >
                <span>{(s as any).courseTitle ?? (s as any).courseName ?? t("shared.door.session")}</span>
                <Num.ClockRange start={s.startTime} end={s.endTime} locale={locale} />
              </button>
            ))}
          </div>
        )}
      </div>

      {sessionId ? (
        <>
          {/* The live console — always on screen, never a step to get past.
              Code entry, scan and confirm are the same action three ways in,
              so all three stay in one panel instead of a wizard sequence. */}
          <div
            className="space-y-3 rounded-xl border border-rule bg-sheet p-4"
            style={{ boxShadow: "var(--lift)" }}
          >
            <div className="flex items-center gap-2 text-indigo">
              <DoorOpen className="size-4" aria-hidden="true" />
              <span className="eyebrow text-indigo">{t("shared.door.atTheDoor")}</span>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="door-code-input" className="text-xs font-medium text-ink-2">
                {t("shared.door.codeLabel")}
              </label>
              <div className="flex items-center gap-2">
                <Input
                  id="door-code-input"
                  className="h-12 text-base"
                  dir="ltr"
                  placeholder={t("shared.door.codePlaceholder")}
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && code.trim() && confirm({ studentCode: code.trim() })}
                />
                <Button size="touch" disabled={busy || !code.trim()} onClick={() => confirm({ studentCode: code.trim() })}>
                  {busy ? <Spinner /> : <CheckCircle2 className="size-4" />}
                  {t("shared.door.confirm")}
                </Button>
              </div>
            </div>
            <QrScannerButton
              onScan={(raw) => {
                setCode(raw);
                void confirm({ studentCode: raw });
              }}
              label={t("shared.door.scanCard")}
              title={t("shared.door.scanTitle")}
              hint={t("shared.door.scanHint")}
              deniedMessage={t("shared.door.scanDenied")}
              className="h-11 px-2 text-[13px]"
            />
          </div>

          {/* Progress readout — a live count, not a report: the number the
              operator actually watches while the queue at the door moves. */}
          {rosterTotal > 0 ? (
            <div className="space-y-1.5">
              <div className="flex items-baseline justify-between text-[13px]">
                <span className="text-ink-2">
                  <Figure className="font-semibold text-ink">{checkedIn}</Figure>
                  {" "}
                  {t("shared.door.checkedInOf", { total: rosterTotal })}
                </span>
                {remaining > 0 ? (
                  <span className="text-amber">{t("shared.door.remainingCount", { n: remaining })}</span>
                ) : (
                  <StatusBadge tone="success" icon={CheckCircle2}>
                    {t("shared.door.committed")}
                  </StatusBadge>
                )}
              </div>
              <Progress value={progressPct} className="h-1.5" />
            </div>
          ) : null}

          <SectionHead
            eyebrow={t("shared.door.rosterEyebrow")}
            title={
              (sessions?.find((s) => s.id === sessionId) as any)?.courseTitle ??
              (sessions?.find((s) => s.id === sessionId) as any)?.courseName ??
              t("shared.door.session")
            }
          />

          {roster === null ? (
            <Spinner />
          ) : roster.length === 0 ? (
            <p className="text-sm text-ink-2">{t("shared.door.emptyRoster")}</p>
          ) : (
            <div className="space-y-2">
              {roster.map((r) => (
                <div
                  key={r.studentId}
                  className="flex items-center justify-between rounded-lg border border-rule bg-sheet p-3"
                >
                  <span>
                    <span className="block font-medium text-ink">{r.name}</span>
                    <span className="block font-mono text-xs text-ink-2" dir="ltr">
                      {r.studentCode ?? ""}
                    </span>
                  </span>
                  {r.doorAt ? (
                    <StatusBadge tone="success" icon={CheckCircle2}>
                      {t("shared.door.doorDone")}
                    </StatusBadge>
                  ) : r.counterAt ? (
                    <Button size="sm" disabled={busy} onClick={() => confirm({ studentId: r.studentId })}>
                      {t("shared.door.confirm")}
                    </Button>
                  ) : (
                    <StatusBadge tone="neutral">{t("shared.door.noCounter")}</StatusBadge>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}
