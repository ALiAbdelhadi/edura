"use client";

import { useEffect, useState } from "react";
import { useCustomMutation } from "@refinedev/core";
import { DoorOpen, CheckCircle2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@repo/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import { Input } from "@repo/ui/components/input";
import { toast } from "@repo/ui/components/sonner";
import { api } from "@/lib/api/client";
import { PageHeader } from "@/components/kit/page-header";
import { StatusBadge } from "@/components/kit/status-badge";
import { Spinner } from "@/components/kit/spinner";

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
  const { mutateAsync: post } = useCustomMutation();

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
        const today = new Date().toISOString().slice(0, 10);
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

  const confirm = async (input: { studentId?: string; studentCode?: string }) => {
    if (!sessionId) return;
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
                <span dir="ltr">
                  {s.startTime}–{s.endTime}
                </span>
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
