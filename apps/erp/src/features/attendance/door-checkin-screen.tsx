"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { todayKey } from "@repo/server-core/lib/date-key";
import { resolveStudentCode } from "@repo/database/student-code";
import { codeFromScan } from "@/lib/attendance/scanned-code";
import { useCustomMutation, useGetIdentity } from "@refinedev/core";
import { CloudOff, DoorOpen, CheckCircle2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@repo/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import { Input } from "@repo/ui/components/input";
import { Num } from "@repo/ui/components/num";
import { toast } from "@repo/ui/components/sonner";
import { api } from "@/lib/api/client";
import { PageHeader } from "@/components/kit/page-header";
import { QrScannerButton } from "@/components/kit/qr-scanner-button";
import { StatusBadge } from "@/components/kit/status-badge";
import { Spinner } from "@/components/kit/spinner";
import { enqueueAttendance } from "@/lib/pwa/attendance-outbox";
import { useAttendanceSync } from "@/lib/pwa/use-attendance-sync";
import { useFormatters } from "@/lib/i18n/use-formatters";

type DoorRow = {
  studentId: string;
  name: string;
  studentCode: string | null;
  status: string;
  counterAt: string | null;
  doorAt: string | null;
};

type SessionRow = { id: string; courseTitle?: string; startTime: string; endTime: string; date: string };

/**
 * Door check-in (Step 6) — the assistant confirms counter-passed students at
 * the classroom door (teacher's own account works as fallback). Phone-first.
 */
export function DoorCheckinScreen() {
  const t = useTranslations();
  const { locale } = useFormatters();
  const { mutateAsync: post } = useCustomMutation();
  const { data: identity } = useGetIdentity<{
    id?: string;
    actingTeacherId?: string;
  }>();
  // Same derivation as the teacher's attendance screen: the queue belongs to
  // the TEACHER, so an assistant's door records replay correctly whether the
  // assistant or the teacher is the one who gets back online.
  const teacherId = identity?.actingTeacherId ?? identity?.id;
  const { queueCount, isSyncing, flush, refreshCount } =
    useAttendanceSync(teacherId);

  const [sessions, setSessions] = useState<SessionRow[] | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [roster, setRoster] = useState<DoorRow[] | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [counterOnly, setCounterOnly] = useState(false);

  // The server throws its errors in English; the toast must speak the UI's
  // language, so the two known refusals are mapped onto i18n keys here.
  const doorErrorMessage = (err: any) => {
    const status = err?.statusCode ?? err?.response?.status;
    const message: string = err?.message ?? "";
    if (status === 404 || /not found/i.test(message)) return t("shared.door.notFound");
    if (/counter/i.test(message)) return t("shared.door.counterFirst");
    return message || t("shared.door.failed");
  };

  useEffect(() => {
    // Teacher-only endpoint: an assistant opening this screen just gets no
    // notice — the check is informational, never a gate.
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
        // Cairo's today, not the browser's UTC day: this screen stands at the
        // classroom door, and a late session running past midnight local time
        // would otherwise fetch the PREVIOUS day's list and show none of it.
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

  // A hand-off from the scan page (`/c/<payload>` → "continue to the door")
  // arrives as `?code=`. It PREFILLS and deliberately does NOT confirm: the
  // confirmation is a write, and a write fired by merely opening a URL is one
  // a prefetch, a share or a back button can repeat. The operator still
  // presses the button — they just no longer type eight characters they were
  // already holding in their other hand.
  //
  // Declared AFTER `loadRoster` on purpose: the effect calls it, and reading a
  // `const` from above its declaration works at runtime but is a temporal-dead-
  // zone hazard the moment anyone moves this call anywhere but an effect body.
  const handedOff = useRef(false);
  const searchParams = useSearchParams();
  // Read straight from the URL rather than mirrored into state: the notice
  // must show while the lesson list is still loading, which is before the
  // effect has run. Resolved through `codeFromScan` so that only a REAL code
  // claims "card received" — a query string is whatever anyone typed, and
  // echoing junk back as a received card is a lie the operator would act on.
  const handedOffCode = codeFromScan(searchParams.get("code") ?? "");
  useEffect(() => {
    // Waits for the lesson list: arriving before it lands would take the
    // one-lesson shortcut below off the table for exactly the operator the
    // hand-off was built for.
    if (!handedOffCode || handedOff.current || sessions === null) return;
    handedOff.current = true;
    setCode(handedOffCode);
    // One lesson today is not a choice, and making someone tap it answers
    // nothing. Two or more and the door genuinely does not know which one
    // they are standing at, so it must not guess.
    const only = sessions.length === 1 ? sessions[0] : null;
    if (only && !sessionId) void loadRoster(only.id);
    // `loadRoster` is redefined every render; the ref is what makes this run
    // once, so chasing it as a dependency would buy nothing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handedOffCode, sessions]);

  /**
   * Resolve what the operator gave us against THIS lesson's cached roster.
   *
   * Offline there is no database to ask, so the roster — the students who have
   * already passed the counter for this lesson — is the only set we may resolve
   * within, and that is the right set: it is strictly NARROWER than the online
   * path, which looks the code up platform-wide.
   *
   * A scanned card is a signed URL that carries the code in plain sight (the
   * cheap keyboard-wedge scanners centres own depend on that). We cannot check
   * the signature without the server's secret — but neither does the online
   * door endpoint, which accepts a `forged` or hand-typed scan and rejects only
   * an `unreadable` one. So this grants no authority the roster button beside
   * it does not already grant, and on replay `doorTransitionTx` re-checks the
   * counter step anyway.
   */
  const findRosterRow = (input: {
    studentId?: string;
    studentCode?: string;
  }): DoorRow | null => {
    if (!roster) return null;
    if (input.studentId)
      return roster.find((r) => r.studentId === input.studentId) ?? null;

    const raw = input.studentCode?.trim();
    if (!raw) return null;

    // One resolver for a typed code AND a scanned card, so the Crockford
    // substitutions (O→0, I/L→1) and the check character behave at the door
    // exactly as they do online. See `codeFromScan` for why the signature is
    // not — and need not be — checked here.
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
    // Refusing by name is the honest outcome: we genuinely do not know whether
    // this student exists, only that they are not on this lesson's list.
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
    // Without this the count only catches up on the NEXT mount, so the
    // operator queues confirmations at the door and the "n waiting to sync"
    // banner stays hidden — the one piece of feedback telling them the work is
    // held rather than lost. Observed in the browser before it was added.
    await refreshCount();
    // Mark it locally so the queue is visible in the list the operator is
    // working from — the replay is idempotent, so an optimistic row that turns
    // out to have been confirmed already costs nothing.
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

  return (
    <div className="mx-auto max-w-xl space-y-6">
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

      <Card>
        <CardHeader>
          <CardTitle>{t("shared.door.pickSession")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {/* THE CARD MUST NOT ARRIVE SILENTLY. The scanned code is held in
              state, but the box that shows it only renders once a lesson is
              picked — so with no lesson today, or with two, the operator who
              just scanned a card landed on a screen with no sign their scan
              had registered at all. Found in the browser, not by reading the
              code: the one-lesson shortcut hid it during the first walkthrough
              and a second lesson brought it straight back. */}
          {handedOffCode && !sessionId ? (
            <p
              className="rounded-lg px-3 py-2 text-sm"
              style={{ background: "var(--indigo-soft)", color: "var(--ink)" }}
            >
              {t("shared.door.handedOff", { code: handedOffCode })}
            </p>
          ) : null}
          {sessions === null ? (
            <Spinner />
          ) : sessions.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("shared.door.noSessions")}</p>
          ) : (
            sessions.map((s) => (
              <Button
                key={s.id}
                variant={sessionId === s.id ? "default" : "outline"}
                className="w-full justify-between"
                onClick={() => loadRoster(s.id)}
              >
                <span>{(s as any).courseTitle ?? (s as any).courseName ?? t("shared.door.session")}</span>
                <Num.ClockRange start={s.startTime} end={s.endTime} locale={locale} />
              </Button>
            ))
          )}
        </CardContent>
      </Card>

      {sessionId ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DoorOpen className="size-4" />
              {t("shared.door.atTheDoor")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2">
              <Input
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

            {/* The door is the one place a scan is worth most: an assistant is
                standing in a doorway with a phone and a queue, not sitting at a
                keyboard. It confirms IMMEDIATELY rather than filling the box —
                the operator already aimed at one card, and `doorCheckin` takes
                the scanned URL through the same `readStudentScan` the typed
                code goes through. Present on any device with a camera,
                iPhones included — see `lib/attendance/qr-decoder`. */}
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

            {roster === null ? (
              <Spinner />
            ) : roster.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("shared.door.emptyRoster")}</p>
            ) : (
              <div className="space-y-2">
                {roster.map((r) => (
                  <div
                    key={r.studentId}
                    className="flex items-center justify-between rounded-lg border border-border p-3"
                  >
                    <span>
                      <span className="block font-medium">{r.name}</span>
                      <span className="block font-mono text-xs text-muted-foreground" dir="ltr">
                        {r.studentCode ?? ""}
                      </span>
                    </span>
                    {r.doorAt ? (
                      <StatusBadge tone="success">{t("shared.door.doorDone")}</StatusBadge>
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
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
