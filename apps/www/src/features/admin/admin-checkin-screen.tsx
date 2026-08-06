/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { InviteLink, type InviteDelivery } from "@/components/kit/invite-link";
import { api } from "@/lib/api/client";
import { useFormatters } from "@/lib/i18n/use-formatters";
import { useCustomMutation } from "@refinedev/core";
import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { SearchInput } from "@repo/ui/components/search-input";
import { toast } from "@repo/ui/components/sonner";
import { Banknote, CheckCircle2, DoorOpen, UserPlus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import {
  Amount,
  Badge,
  Computation,
  EmptyState,
  Eyebrow,
  Num,
  PageHead,
  RowIdentity,
  Sheet,
  SheetHead,
  TwoStepCommit,
  postMoney,
  readApiError,
} from "./ledger";

type Match = {
  studentId: string;
  name: string | null;
  /**
   * Null for a student this center does not hold who was reached by phone
   * rather than by their code — see `lookupStudents`. Withheld, not missing.
   */
  studentCode: string | null;
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

/**
 * تشيك-إن الكاونتر — the counter.
 *
 * The surface furthest from a ledger and the one where the underlying principle
 * is strongest. A receptionist is standing, one-handed, with a parent in front
 * of them and a queue behind. Deliberation is the wrong virtue; certainty is the
 * right one, and the screen answers one question instantly: did this commit?
 *
 * Rendered at `touch` density under /dashboard/staff and `compact` under
 * /dashboard/admin — one prop, set on the `.led` wrapper in each layout.
 */
export function AdminCheckinScreen() {
  const t = useTranslations();
  const { formatEGP, locale } = useFormatters();
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
  // The payment step is part of the check-in flow, not a separate screen: it
  // attaches to the one session row it belongs to and carries the server's price.
  const [payment, setPayment] = useState<{
    sessionId: string;
    courseTitle: string;
    pricePerSession: number | null;
  } | null>(null);

  const clearPayment = () => setPayment(null);

  const search = async () => {
    if (q.trim().length < 2) return;
    setBusy(true);
    setStudent(null);
    setSessions(null);
    clearPayment();
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
    clearPayment();
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

  /** Posts the check-in and reports the resulting stage. Shared by both entries
   *  into the flow — the direct one and the one that follows cash collection. */
  const commitCheckin = async (s: SessionOption) => {
    if (!student) return;
    // Long timeout too: this is the second half of a money commit, and giving
    // up early here is what strands a paid student without attendance.
    const data = await postMoney<{ status?: string }>("center/checkin", {
      studentId: student.studentId,
      sessionId: s.sessionId,
    });
    toast.success(
      data?.status === "present"
        ? t("shared.checkin.present")
        : t("shared.checkin.counterDone"),
    );
    clearPayment();
    await pickStudent(student); // refresh coverage states
  };

  /**
   * Entry to the flow. An uncovered student is not an error — it is the next
   * step, so it never surfaces as a red toast. Where the suggest response
   * already says the session is uncovered we go straight to collection instead
   * of firing a request we know will 402; where that answer is stale, the
   * server's `needs_payment` lands on the same step. One flow, two doors.
   */
  const startCheckin = async (s: SessionOption) => {
    if (!student) return;
    if (!s.covered) {
      setPayment({
        sessionId: s.sessionId,
        courseTitle: s.courseTitle,
        pricePerSession: s.pricePerSession,
      });
      return;
    }
    setBusy(true);
    try {
      await commitCheckin(s);
    } catch (err) {
      const e = await readApiError(err);
      if (e.code === "needs_payment") {
        const dt = e.details ?? {};
        setPayment({
          sessionId: s.sessionId,
          courseTitle: (dt.courseTitle as string | undefined) ?? s.courseTitle,
          pricePerSession: (dt.pricePerSession as number | null | undefined) ?? s.pricePerSession,
        });
      } else {
        toast.error(e.message || t("shared.checkin.checkinFailed"));
      }
    } finally {
      setBusy(false);
    }
  };

  /**
   * Did the cash actually land? Re-reads coverage from the server.
   *
   * The client cannot tell a failed write from a lost response. `api` times out
   * at 10s (lib/api/client.ts) and the subscriptions transaction writes Payment
   * + Transaction + points + notification — so a slow counter connection can
   * time the CLIENT out while the SERVER commits. Coverage is the server's own
   * answer to "was this paid for", so ask it rather than guessing.
   */
  const coverageLanded = async (sessionId: string) => {
    if (!student) return false;
    try {
      const res = await api
        .get(`center/checkin/suggest?studentId=${student.studentId}`)
        .json<{ data: { suggested: SessionOption[]; today: SessionOption[] } }>();
      return [...res.data.suggested, ...res.data.today].some(
        (x) => x.sessionId === sessionId && x.covered,
      );
    } catch {
      return false;
    }
  };

  /**
   * The armed commit: take the cash, then check in, without leaving the row.
   *
   * These are deliberately TWO server calls. The subscriptions endpoint can do
   * both atomically via `markAttendance: true`, but that path predates Step 6 —
   * it writes `status: "present"` unconditionally with no `counterAt`, so it
   * would mark a student present even under `counter_and_door` (where the
   * counter alone must NOT count as present) and would leave the later door
   * check-in rejecting with `no_counter`. Correct staging is worth the split.
   *
   * What the split costs is atomicity, so the gap is closed here: if the charge
   * appears to fail we re-read coverage before saying so, and if the charge
   * landed but the check-in did not, we say THAT — never something that reads
   * as "nothing happened", which is what invites a second charge.
   */
  const collectAndCheckin = async (s: SessionOption) => {
    if (!student) return;
    setBusy(true);
    let charged = false;
    try {
      try {
        await postMoney("center/subscriptions", {
          studentId: student.studentId,
          courseId: sessionCourse(s),
          plan: "per_session",
          sessionId: s.sessionId,
          // Staged check-in happens in the next call — see the note above.
          markAttendance: false,
        });
        charged = true;
      } catch (chargeErr) {
        // Self-heal: the write may have committed while the client gave up.
        if (await coverageLanded(s.sessionId)) {
          charged = true;
        } else {
          const e = await readApiError(chargeErr);
          toast.error(e.message || t("shared.checkin.cashFailed"));
          return;
        }
      }

      toast.success(t("shared.checkin.cashCollected"));
      await commitCheckin(s);
    } catch (err) {
      const e = await readApiError(err);
      if (charged) {
        // The money is in the ledger and the student is covered; only the
        // attendance mark is missing. Say so explicitly and leave the row on
        // its now-covered "check in" action — collecting again would
        // double-charge a family standing at the counter.
        toast.error(t("shared.checkin.paidNotCheckedIn"), { duration: 12000 });
        clearPayment();
        await pickStudent(student);
      } else {
        toast.error(e.message || t("shared.checkin.checkinFailed"));
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

  /**
   * The payment step, inside the session row it belongs to rather than in a
   * modal — the operator must see which session they are collecting for while
   * they collect. Money treatment in full: the computation, the double-rule
   * total, and a commit that names its own amount.
   */
  const paymentStep = (s: SessionOption) => {
    const price = payment?.pricePerSession ?? null;
    return (
      <div className="border-t border-[var(--rule)] bg-[var(--amber-soft)]/40 p-4">
        <Eyebrow>{t("shared.checkin.needsPaymentTitle")}</Eyebrow>
        <p className="mt-1.5 mb-3 text-[13px] leading-relaxed text-[var(--ink-2)]">
          {t("shared.checkin.needsPaymentBody", {
            course: payment?.courseTitle ?? s.courseTitle,
          })}
        </p>

        {price == null ? (
          <p className="m-0 text-[13px] text-[var(--ink-2)]">
            {t("shared.checkin.noSessionPrice")}
          </p>
        ) : (
          <>
            <Computation
              lines={[
                {
                  label: payment?.courseTitle ?? s.courseTitle,
                  value: <Amount piasters={price} locale={locale} />,
                },
              ]}
              totalLabel={t("shared.checkin.cashDue")}
              totalValue={<Amount piasters={price} locale={locale} />}
            />
            <div className="mt-3">
              <TwoStepCommit
                // Row change disarms: the key is the session being paid for.
                resetKey={payment?.sessionId ?? null}
                icon={<Banknote className="size-4" />}
                label={t("shared.checkin.armCollect", { price: formatEGP(price) })}
                armedLabel={t("shared.checkin.confirmCollect", { price: formatEGP(price) })}
                busy={busy}
                onCommit={() => collectAndCheckin(s)}
                // Thumb reach at the counter; inline at a desk.
                anchor="viewport-bottom"
              />
              <button
                type="button"
                onClick={clearPayment}
                className="mt-2 h-11 w-full rounded-lg text-[13px] font-medium text-[var(--ink-2)]"
              >
                {t("actions.cancel")}
              </button>
            </div>
          </>
        )}
      </div>
    );
  };

  const sessionRow = (s: SessionOption, suggested: boolean) => {
    const paying = payment?.sessionId === s.sessionId;
    return (
      <div key={s.sessionId} className="border-b border-[var(--rule-2)] last:border-b-0">
        <div className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="min-w-0">
            <div className="text-[15px] font-semibold text-[var(--ink)]">{s.courseTitle}</div>
            <Num className="mt-0.5 block text-xs text-[var(--ink-3)]">
              {s.startTime}–{s.endTime}
            </Num>
            {suggested ? (
              <span className="mt-1.5 inline-block">
                <Badge tone="done">{t("shared.checkin.coveredBadge")}</Badge>
              </span>
            ) : null}
          </div>
          {paying ? null : s.covered ? (
            <Button size="lg" className="h-12 min-w-[132px]" disabled={busy} onClick={() => startCheckin(s)}>
              <CheckCircle2 className="size-4" />
              {t("shared.checkin.checkIn")}
            </Button>
          ) : s.pricePerSession != null ? (
            <Button
              size="lg"
              variant="outline"
              className="h-12"
              disabled={busy}
              onClick={() => startCheckin(s)}
            >
              <Banknote className="size-4" />
              {t("shared.checkin.collectAndCheckIn", { price: formatEGP(s.pricePerSession) })}
            </Button>
          ) : (
            <span className="text-[13px] text-[var(--ink-3)]">
              {t("shared.checkin.noSessionPrice")}
            </span>
          )}
        </div>
        {paying ? paymentStep(s) : null}
      </div>
    );
  };

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5">
      <PageHead title={t("shared.checkin.title")} subtitle={t("shared.checkin.description")} />

      <Sheet>
        <div className="flex flex-col gap-3 p-4">
          <SearchInput
            // First focusable element on the screen, numeric-friendly. `num`
            // sits on the group so the mono/tabular face inherits to the input —
            // student IDs read as figures, not prose.
            autoFocus
            inputMode="search"
            density="touch"
            className="num border-[var(--rule)] bg-[var(--field)]"
            placeholder={t("shared.checkin.searchPlaceholder")}
            value={q}
            onValueChange={setQ}
            onSubmit={search}
            action={{ label: t("actions.search"), onClick: search, busy }}
          />
          <Button
            variant="ghost"
            className="h-11 self-start px-2 text-[13px]"
            onClick={() => setWalkInOpen((v) => !v)}
          >
            <UserPlus className="size-4" />
            {t("shared.checkin.newWalkIn")}
          </Button>

          {walkInOpen ? (
            <div className="lg-field flex flex-col gap-2.5 p-3.5">
              <Input
                className="h-12 text-base"
                placeholder={t("shared.checkin.walkInName")}
                value={walkName}
                onChange={(e) => setWalkName(e.target.value)}
              />
              <Input
                className="num h-12 text-base"
                placeholder={t("shared.checkin.walkInPhone")}
                dir="ltr"
                inputMode="tel"
                value={walkPhone}
                onChange={(e) => setWalkPhone(e.target.value)}
              />
              <div className="rounded-lg border border-[var(--rule)] bg-[var(--sheet)] p-3">
                <Eyebrow>{t("shared.checkin.guardianContactTitle")}</Eyebrow>
                <div className="mt-2 flex flex-col gap-2">
                  <Input
                    className="num h-12 text-base"
                    placeholder={t("shared.checkin.guardianEmail")}
                    type="email"
                    dir="ltr"
                    value={guardianEmail}
                    onChange={(e) => setGuardianEmail(e.target.value)}
                  />
                  <Input
                    className="num h-12 text-base"
                    placeholder={t("shared.checkin.guardianPhone")}
                    dir="ltr"
                    inputMode="tel"
                    value={guardianPhone}
                    onChange={(e) => setGuardianPhone(e.target.value)}
                  />
                </div>
                <p className="mt-2 mb-0 text-xs leading-relaxed text-[var(--ink-2)]">
                  {t("shared.checkin.guardianContactHint")}
                </p>
              </div>
              <Button className="h-12" onClick={createWalkIn} disabled={busy}>
                {t("shared.checkin.walkInCreate")}
              </Button>
            </div>
          ) : null}

          {pendingInvite ? (
            <div className="flex flex-col gap-2">
              {pendingInvite.guardianEmailRequired ? (
                // Not an error — a protection being applied. Amber, and it says
                // exactly what still works (classes, payments) and what does not.
                <div className="rounded-lg border border-[var(--amber)] bg-[var(--amber-soft)] p-3">
                  <p className="m-0 text-[13px] font-semibold text-[var(--amber)]">
                    {t("shared.checkin.guardianEmailMissingTitle")}
                  </p>
                  <p className="mt-1 mb-0 text-xs leading-relaxed text-[var(--ink-2)]">
                    {t("shared.checkin.guardianEmailMissingBody", { name: pendingInvite.name })}
                  </p>
                </div>
              ) : null}
              <InviteLink link={pendingInvite.link} delivery={pendingInvite.delivery} />
              <Button
                variant="ghost"
                className="h-11 self-start text-[13px]"
                onClick={() => setPendingInvite(null)}
              >
                {t("invite.done")}
              </Button>
            </div>
          ) : null}
        </div>
      </Sheet>

      {matches ? (
        <Sheet>
          <SheetHead title={t("shared.checkin.results")} />
          {matches.length === 0 ? (
            <EmptyState title={t("shared.checkin.noMatches")} />
          ) : (
            <div>
              {matches.map((m) => (
                <button
                  key={m.studentId}
                  type="button"
                  onClick={() => pickStudent(m)}
                  className="flex w-full items-center justify-between gap-3 border-b border-[var(--rule-2)] p-4 text-start last:border-b-0 hover:bg-[var(--rule-2)]"
                >
                  <RowIdentity
                    name={m.name ?? "—"}
                    meta={[m.studentCode, m.phone].filter(Boolean).join(" · ")}
                  />
                  <span className="flex flex-col items-end gap-1">
                    {m.onOurRoster ? (
                      <Badge tone="done">{t("shared.checkin.ourStudent")}</Badge>
                    ) : m.otherCenters.length > 0 ? (
                      <Badge tone="pending">
                        {t("shared.checkin.knownElsewhere", { center: m.otherCenters[0] })}
                      </Badge>
                    ) : (
                      <Badge tone="neutral">{t("shared.checkin.newHere")}</Badge>
                    )}
                    {m.isShell ? <Badge tone="neutral">{t("shared.checkin.tempBadge")}</Badge> : null}
                  </span>
                </button>
              ))}
            </div>
          )}
        </Sheet>
      ) : null}

      {student ? (
        <Sheet>
          <div className="flex items-center justify-between gap-3 border-b border-[var(--rule)] p-4">
            <RowIdentity name={student.name ?? "—"} meta={student.studentCode ?? ""} />
            {student.isShell ? (
              <Button variant="outline" className="h-11" disabled={busy} onClick={resendWhatsApp}>
                {t("shared.checkin.resendWhatsApp")}
              </Button>
            ) : null}
          </div>

          {student.otherCenters.length > 0 && !student.onOurRoster ? (
            <p className="m-0 border-b border-[var(--rule-2)] bg-[var(--amber-soft)] px-4 py-3 text-[13px] leading-relaxed text-[var(--amber)]">
              {t("shared.checkin.crossCenterNote", { center: student.otherCenters[0] })}
            </p>
          ) : null}

          {sessions ? (
            <>
              {sessions.suggested.length > 0 ? (
                <div>
                  <div className="border-b border-[var(--rule)] bg-[var(--field)] px-4 py-2.5">
                    <Eyebrow>{t("shared.checkin.suggested")}</Eyebrow>
                  </div>
                  {sessions.suggested.map((s) => sessionRow(s, true))}
                </div>
              ) : null}
              <div>
                <div className="flex items-center gap-2 border-b border-[var(--rule)] bg-[var(--field)] px-4 py-2.5">
                  <DoorOpen className="size-3.5 text-[var(--ink-3)]" />
                  <Eyebrow>{t("shared.checkin.todaysSessions")}</Eyebrow>
                </div>
                {sessions.today.filter((s) => !sessions.suggested.some((x) => x.sessionId === s.sessionId))
                  .length === 0 ? (
                  <EmptyState title={t("shared.checkin.noSessionsToday")} />
                ) : (
                  sessions.today
                    .filter((s) => !sessions.suggested.some((x) => x.sessionId === s.sessionId))
                    .map((s) => sessionRow(s, false))
                )}
              </div>
            </>
          ) : (
            <div className="p-8 text-center text-[13px] text-[var(--ink-3)]">
              {t("centerStaff.loading")}
            </div>
          )}
        </Sheet>
      ) : null}
    </div>
  );
}
