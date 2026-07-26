/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { InviteLink, type InviteDelivery } from "@/components/kit/invite-link";
import { PageHeader } from "@/components/kit/page-header";
import { Spinner } from "@/components/kit/spinner";
import { StatusBadge } from "@/components/kit/status-badge";
import { api } from "@/lib/api/client";
import { useFormatters } from "@/lib/i18n/use-formatters";
import { useCustomMutation } from "@refinedev/core";
import { Button } from "@repo/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import { Input } from "@repo/ui/components/input";
import { toast } from "@repo/ui/components/sonner";
import { Banknote, CheckCircle2, DoorOpen, Search, UserPlus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

type Match = {
  studentId: string;
  name: string | null;
  studentCode: string;
  phone: string | null;
  isShell: boolean;
  onOurRoster: boolean;
  otherCenters: string[];
};

type SessionOption = {
  sessionId: string;
  courseTitle: string;
  startTime: string;
  endTime: string;
  covered: boolean;
  pricePerSession: number | null;
};

export function AdminCheckinScreen() {
  const t = useTranslations();
  const { formatEGP } = useFormatters();
  const { mutateAsync: post } = useCustomMutation();

  const [q, setQ] = useState("");
  const [matches, setMatches] = useState<Match[] | null>(null);
  const [student, setStudent] = useState<Match | null>(null);
  const [sessions, setSessions] = useState<{ suggested: SessionOption[]; today: SessionOption[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [walkInOpen, setWalkInOpen] = useState(false);
  const [guardianEmail, setGuardianEmail] = useState("");
  const [guardianPhone, setGuardianPhone] = useState("");
  const [pendingInvite, setPendingInvite] = useState<{
    link: string;
    delivery: InviteDelivery;
    guardianEmailRequired: boolean;
    studentId: string;
    name: string;
  } | null>(null);
  const [walkName, setWalkName] = useState("");
  const [walkPhone, setWalkPhone] = useState("");

  const search = async () => {
    if (q.trim().length < 2) return;
    setBusy(true);
    setStudent(null);
    setSessions(null);
    try {
      const res = await api.get(`center/checkin/lookup?q=${encodeURIComponent(q.trim())}`).json<{ data: Match[] }>();
      setMatches(res.data);
    } catch (err: any) {
      toast.error(err?.message || t("shared.checkin.searchFailed"));
    } finally {
      setBusy(false);
    }
  };

  const pickStudent = async (m: Match) => {
    setStudent(m);
    setMatches(null);
    setBusy(true);
    try {
      const res = await api
        .get(`center/checkin/suggest?studentId=${m.studentId}`)
        .json<{ data: { suggested: SessionOption[]; today: SessionOption[] } }>();
      setSessions(res.data);
    } catch (err: any) {
      toast.error(err?.message || t("shared.checkin.searchFailed"));
    } finally {
      setBusy(false);
    }
  };

  const checkin = async (s: SessionOption, payFirst: boolean) => {
    if (!student) return;
    setBusy(true);
    try {
      if (payFirst) {
        await post({
          url: "center/subscriptions",
          method: "post",
          values: {
            studentId: student.studentId,
            courseId: sessionCourse(s),
            plan: "per_session",
            sessionId: s.sessionId,
            markAttendance: false,
          },
        });
        toast.success(t("shared.checkin.cashCollected"));
      }
      const res = await post({
        url: "center/checkin",
        method: "post",
        values: { studentId: student.studentId, sessionId: s.sessionId },
      });
      const data = (res as any)?.data?.data ?? (res as any)?.data;
      if (data?.status === "present") {
        toast.success(t("shared.checkin.present"));
      } else {
        toast.success(t("shared.checkin.counterDone"));
      }
      await pickStudent(student); // refresh coverage states
    } catch (err: any) {
      const detail = err?.response;
      if (err?.message?.includes("no coverage") || detail?.status === 402) {
        toast.error(t("shared.checkin.needsPayment"));
      } else {
        toast.error(err?.message || t("shared.checkin.checkinFailed"));
      }
    } finally {
      setBusy(false);
    }
  };

  const sessionCourse = (s: SessionOption) => (s as any).courseId as string;

  const createWalkIn = async () => {
    if (walkName.trim().length < 2 || walkPhone.trim().length < 8) {
      toast.error(t("shared.checkin.walkInMissing"));
      return;
    }
    setBusy(true);
    try {
      const res = await post({
        url: "center/walk-in",
        method: "post",
        values: {
          fullName: walkName.trim(),
          phone: walkPhone.trim(),
          // Guardian contact: email if the family has one, otherwise the phone.
          // Both optional — registration is never blocked on this.
          ...(guardianEmail.trim() ? { guardianEmail: guardianEmail.trim() } : {}),
          ...(guardianPhone.trim() ? { guardianPhone: guardianPhone.trim() } : {}),
        },
      });
      const data = (res as any)?.data?.data ?? (res as any)?.data;
      toast.success(
        data.existing
          ? t("shared.checkin.existingResent", { code: data.studentCode ?? "" })
          : t("shared.checkin.walkInCreated"),
      );

      const invite = data.invite;
      if (invite?.email?.status === "sent") {
        toast.success(t("shared.checkin.inviteEmailSent"));
      } else if (invite?.guardianEmailRequired) {
        // The child-safety path: a MINOR with no guardian email. We do NOT mail
        // the child. Surface the link so the counter hands it to the guardian
        // who is standing right there, and say plainly what is still owed.
        toast.warning(t("shared.checkin.guardianEmailMissing"));
      }
      if (invite?.claimLink) {
        setPendingInvite({
          link: invite.claimLink,
          delivery: invite.email?.status ?? "no_recipient",
          guardianEmailRequired: !!invite.guardianEmailRequired,
          studentId: data.studentId,
          name: data.fullName ?? "",
        });
      }

      setWalkInOpen(false);
      setWalkName("");
      setWalkPhone("");
      setGuardianEmail("");
      setGuardianPhone("");
      await pickStudent({
        studentId: data.studentId,
        name: data.fullName,
        studentCode: data.studentCode ?? "",
        phone: walkPhone.trim(),
        isShell: !data.existing,
        onOurRoster: true,
        otherCenters: [],
      });
    } catch (err: any) {
      toast.error(err?.message || t("shared.checkin.walkInFailed"));
    } finally {
      setBusy(false);
    }
  };

  const resendWhatsApp = async () => {
    if (!student) return;
    setBusy(true);
    try {
      const res = await post({
        url: "center/walk-in/resend",
        method: "post",
        values: { studentId: student.studentId },
      });
      const data = (res as any)?.data?.data ?? (res as any)?.data;
      const invite = data.invite;
      // Email is the primary channel now, so report THAT. WhatsApp is only
      // mentioned when the optional channel is actually switched on.
      if (invite?.email?.status === "sent") {
        toast.success(t("shared.checkin.inviteEmailSent"));
      } else if (invite?.guardianEmailRequired) {
        toast.warning(t("shared.checkin.guardianEmailMissing"));
      } else if (data.whatsapp?.status === "sent") {
        toast.success(t("shared.checkin.waSent"));
      } else if (invite?.email?.status === "failed" || data.whatsapp?.status === "failed") {
        toast.error(t("shared.checkin.waFailed"));
      }
      // The claim link comes back on every resend for a still-claimable
      // student — surface it so it can be handed over in person.
      if (invite?.claimLink) {
        setPendingInvite({
          link: invite.claimLink,
          delivery: invite.email?.status ?? "no_recipient",
          guardianEmailRequired: !!invite.guardianEmailRequired,
          studentId: data.studentId,
          name: data.fullName ?? "",
        });
      }
    } catch (err: any) {
      toast.error(err?.message || t("shared.checkin.checkinFailed"));
    } finally {
      setBusy(false);
    }
  };

  const sessionButton = (s: SessionOption, suggested: boolean) => (
    <div
      key={s.sessionId}
      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-3"
    >
      <div className="min-w-0">
        <div className="font-medium">{s.courseTitle}</div>
        <div className="text-xs text-muted-foreground" dir="ltr">
          {s.startTime}–{s.endTime}
        </div>
        {suggested ? (
          <StatusBadge tone="success">{t("shared.checkin.coveredBadge")}</StatusBadge>
        ) : null}
      </div>
      {s.covered ? (
        <Button size="lg" disabled={busy} onClick={() => checkin(s, false)}>
          <CheckCircle2 className="size-4" />
          {t("shared.checkin.checkIn")}
        </Button>
      ) : s.pricePerSession ? (
        <Button size="lg" variant="outline" disabled={busy} onClick={() => checkin(s, true)}>
          <Banknote className="size-4" />
          {t("shared.checkin.collectAndCheckIn", { price: formatEGP(s.pricePerSession) })}
        </Button>
      ) : (
        <span className="text-xs text-muted-foreground">{t("shared.checkin.noSessionPrice")}</span>
      )}
    </div>
  );

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <PageHeader title={t("shared.checkin.title")} description={t("shared.checkin.description")} />

      <Card>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute inset-inline-start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="h-12 ps-9 text-base"
                placeholder={t("shared.checkin.searchPlaceholder")}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && search()}
              />
            </div>
            <Button size="lg" onClick={search} disabled={busy}>
              {busy ? <Spinner /> : t("actions.search")}
            </Button>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setWalkInOpen((v) => !v)}>
            <UserPlus className="size-4" />
            {t("shared.checkin.newWalkIn")}
          </Button>
          {walkInOpen ? (
            <div className="space-y-2 rounded-lg border border-dashed border-border p-3">
              <Input
                placeholder={t("shared.checkin.walkInName")}
                value={walkName}
                onChange={(e) => setWalkName(e.target.value)}
              />
              <Input
                placeholder={t("shared.checkin.walkInPhone")}
                dir="ltr"
                value={walkPhone}
                onChange={(e) => setWalkPhone(e.target.value)}
              />
              <div className="rounded-md border border-border/60 bg-muted/30 p-2.5">
                <p className="mb-2 text-xs font-medium text-foreground">
                  {t("shared.checkin.guardianContactTitle")}
                </p>
                <div className="space-y-2">
                  <Input
                    placeholder={t("shared.checkin.guardianEmail")}
                    type="email"
                    dir="ltr"
                    value={guardianEmail}
                    onChange={(e) => setGuardianEmail(e.target.value)}
                  />
                  <Input
                    placeholder={t("shared.checkin.guardianPhone")}
                    dir="ltr"
                    value={guardianPhone}
                    onChange={(e) => setGuardianPhone(e.target.value)}
                  />
                </div>
                <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
                  {t("shared.checkin.guardianContactHint")}
                </p>
              </div>
              <Button onClick={createWalkIn} disabled={busy}>
                {busy ? <Spinner /> : null}
                {t("shared.checkin.walkInCreate")}
              </Button>
            </div>
          ) : null}
          {pendingInvite ? (
            <div className="space-y-2">
              {pendingInvite.guardianEmailRequired ? (
                <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3">
                  <p className="text-sm font-medium text-amber-700 dark:text-amber-400">
                    {t("shared.checkin.guardianEmailMissingTitle")}
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    {t("shared.checkin.guardianEmailMissingBody", {
                      name: pendingInvite.name,
                    })}
                  </p>
                </div>
              ) : null}
              <InviteLink link={pendingInvite.link} delivery={pendingInvite.delivery} />
              <Button variant="ghost" size="sm" onClick={() => setPendingInvite(null)}>
                {t("invite.done")}
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {matches ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("shared.checkin.results")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {matches.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("shared.checkin.noMatches")}</p>
            ) : (
              matches.map((m) => (
                <button
                  key={m.studentId}
                  type="button"
                  onClick={() => pickStudent(m)}
                  className="flex w-full items-center justify-between rounded-lg border border-border p-3 text-start hover:bg-muted/50"
                >
                  <span>
                    <span className="block font-medium">{m.name}</span>
                    <span className="block text-xs text-muted-foreground" dir="ltr">
                      {m.studentCode} · {m.phone ?? "—"}
                    </span>
                  </span>
                  <span className="flex flex-col items-end gap-1">
                    {m.onOurRoster ? (
                      <StatusBadge tone="success">{t("shared.checkin.ourStudent")}</StatusBadge>
                    ) : m.otherCenters.length > 0 ? (
                      <StatusBadge tone="warning">
                        {t("shared.checkin.knownElsewhere", { center: m.otherCenters[0] })}
                      </StatusBadge>
                    ) : (
                      <StatusBadge tone="neutral">{t("shared.checkin.newHere")}</StatusBadge>
                    )}
                    {m.isShell ? <StatusBadge tone="neutral">{t("shared.checkin.tempBadge")}</StatusBadge> : null}
                  </span>
                </button>
              ))
            )}
          </CardContent>
        </Card>
      ) : null}

      {student ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>{student.name}</span>
              <span className="font-mono text-sm text-muted-foreground" dir="ltr">
                {student.studentCode}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {student.otherCenters.length > 0 && !student.onOurRoster ? (
              <p className="rounded-md bg-warning/10 px-3 py-2 text-sm text-warning">
                {t("shared.checkin.crossCenterNote", { center: student.otherCenters[0] })}
              </p>
            ) : null}

            {student.isShell ? (
              <Button variant="outline" size="sm" disabled={busy} onClick={resendWhatsApp}>
                {t("shared.checkin.resendWhatsApp")}
              </Button>
            ) : null}

            {sessions ? (
              <>
                {sessions.suggested.length > 0 ? (
                  <div className="space-y-2">
                    <div className="text-sm font-medium">{t("shared.checkin.suggested")}</div>
                    {sessions.suggested.map((s) => sessionButton(s, true))}
                  </div>
                ) : null}
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <DoorOpen className="size-4" />
                    {t("shared.checkin.todaysSessions")}
                  </div>
                  {sessions.today.length === 0 ? (
                    <p className="text-sm text-muted-foreground">{t("shared.checkin.noSessionsToday")}</p>
                  ) : (
                    sessions.today
                      .filter((s) => !sessions.suggested.some((x) => x.sessionId === s.sessionId))
                      .map((s) => sessionButton(s, false))
                  )}
                </div>
              </>
            ) : (
              <Spinner />
            )}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
