/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import type { InviteDelivery } from "@/components/kit/invite-link";
import { api } from "@/lib/api/client";
import { useFormatters } from "@/lib/i18n/use-formatters";
import { useCustomMutation } from "@refinedev/core";
import { Button } from "@repo/ui/components/button";
import { SearchInput } from "@repo/ui/components/search-input";
import { toast } from "@repo/ui/components/sonner";
import { Banknote, CheckCircle2, DoorOpen, UserPlus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { QrScannerButton } from "@/components/kit/qr-scanner-button";
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
} from "./ledger";
import { useCheckinCommit, type CheckinTarget } from "./counter/use-checkin-commit";
import { PendingInviteCard } from "./counter/pending-invite-card";
import { WalkInPanel } from "./counter/walk-in-panel";

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
  courseId: string;
  courseTitle: string;
  startTime: string;
  endTime: string;
  covered: boolean;
  pricePerSession: number | null;
  /** Today's attendance for THIS student, if any — "present" / "counter_only". */
  checkinStatus: string | null;
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
  // Search / walk-in / resend own this flag; the commit flow owns its own and
  // the two are read together below, so one spinner still covers the screen.
  const [localBusy, setLocalBusy] = useState(false);
  const [walkInOpen, setWalkInOpen] = useState(false);
  const [pendingInvite, setPendingInvite] = useState<{
    link: string;
    delivery: InviteDelivery;
    guardianEmailRequired: boolean;
    studentId: string;
    name: string;
  } | null>(null);

  // The commit flow (check in / collect then check in, and the payment step
  // that sits between them) lives in one hook shared with the counter board —
  // see counter/use-checkin-commit.ts for why the sequence is shaped this way.
  const commit = useCheckinCommit({
    // Re-reads coverage for the student on screen, which is what this surface
    // shows: the same student's session rows, now with fresh states.
    refresh: () => (student ? pickStudent(student) : undefined),
  });
  const busy = localBusy || commit.busy;

  const pickStudent = async (m: Match) => {
    setStudent(m);
    setMatches(null);
    commit.clearPayment();
    setLocalBusy(true);
    try {
      const res = await api
        .get(`center/checkin/suggest?studentId=${m.studentId}`)
        .json<{ data: { suggested: SessionOption[]; today: SessionOption[] } }>();
      setSessions(res.data);
    } catch (err: any) {
      toast.error(err?.message || t("shared.checkin.searchFailed"));
    } finally {
      setLocalBusy(false);
    }
  };

  /**
   * The search, taking its term as an ARGUMENT rather than reading `q`.
   *
   * Both callers that are not the operator's own Enter key — the scanner, and
   * the `?code=` a scan-page hand-off arrives with — have the term in hand and
   * would otherwise have to `setQ` and then wait a render for the state to be
   * readable. That race is exactly how a scanner ends up searching for the
   * PREVIOUS card.
   */
  const runSearch = async (term: string) => {
    const value = term.trim();
    if (value.length < 2) return;
    setLocalBusy(true);
    setStudent(null);
    setSessions(null);
    commit.clearPayment();
    try {
      const res = await api
        .get(`center/checkin/lookup?q=${encodeURIComponent(value)}`)
        .json<{ data: Match[] }>();
      setMatches(res.data);
      // One match from a scanned card is not an ambiguous result — the
      // operator already pointed the camera at exactly one person. Making them
      // tap a single-row list after that is a step that exists only because
      // typing can be ambiguous.
      if (res.data.length === 1 && res.data[0]) await pickStudent(res.data[0]);
    } catch (err: any) {
      toast.error(err?.message || t("shared.checkin.searchFailed"));
    } finally {
      setLocalBusy(false);
    }
  };

  const search = () => runSearch(q);

  /** A scanned card: put it in the box (so the operator sees what was read)
   *  and search for it in the same tick. */
  const onScan = (raw: string) => {
    setQ(raw);
    void runSearch(raw);
  };

  // A hand-off from the scan page (`/c/<payload>` → "continue to the counter")
  // arrives as `?code=`. Runs once: re-searching on every render would refetch
  // under the operator every time they typed.
  const handedOff = useRef(false);
  const searchParams = useSearchParams();
  useEffect(() => {
    const code = searchParams.get("code");
    if (!code || handedOff.current) return;
    handedOff.current = true;
    setQ(code);
    void runSearch(code);
    // `runSearch` is redefined every render and is not a dependency worth
    // chasing — the ref is what makes this run once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  /**
   * A session row, expressed as the thing the commit hook acts on. Returns null
   * only when no student is selected — every row on this screen belongs to the
   * one student above it.
   */
  const targetOf = (s: SessionOption): CheckinTarget | null =>
    student
      ? {
          studentId: student.studentId,
          sessionId: s.sessionId,
          courseId: s.courseId,
          courseTitle: s.courseTitle,
          pricePerSession: s.pricePerSession,
          covered: s.covered,
        }
      : null;

  const startCheckin = (s: SessionOption) => {
    const target = targetOf(s);
    if (target) void commit.startCheckin(target);
  };

  const resendWhatsApp = async () => {
    if (!student) return;
    setLocalBusy(true);
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
      setLocalBusy(false);
    }
  };

  /**
   * The payment step, inside the session row it belongs to rather than in a
   * modal — the operator must see which session they are collecting for while
   * they collect. Money treatment in full: the computation, the double-rule
   * total, and a commit that names its own amount.
   */
  const paymentStep = (s: SessionOption) => {
    const price = commit.payment?.pricePerSession ?? null;
    return (
      <div className="border-t border-[var(--rule)] bg-[var(--amber-soft)]/40 p-4">
        <Eyebrow>{t("shared.checkin.needsPaymentTitle")}</Eyebrow>
        <p className="mt-1.5 mb-3 text-[13px] leading-relaxed text-[var(--ink-2)]">
          {t("shared.checkin.needsPaymentBody", {
            course: commit.payment?.courseTitle ?? s.courseTitle,
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
                  label: commit.payment?.courseTitle ?? s.courseTitle,
                  value: <Amount piasters={price} locale={locale} />,
                },
              ]}
              totalLabel={t("shared.checkin.cashDue")}
              totalValue={<Amount piasters={price} locale={locale} />}
            />
            <div className="mt-3">
              <TwoStepCommit
                // Row change disarms: the key is the session being paid for.
                resetKey={commit.payment?.sessionId ?? null}
                icon={<Banknote className="size-4" />}
                label={t("shared.checkin.armCollect", { price: formatEGP(price) })}
                armedLabel={t("shared.checkin.confirmCollect", { price: formatEGP(price) })}
                busy={busy}
                onCommit={async () => {
                  const target = targetOf(s);
                  if (target) await commit.collectAndCheckin(target);
                }}
                // Thumb reach at the counter; inline at a desk.
                anchor="viewport-bottom"
              />
              <button
                type="button"
                onClick={commit.clearPayment}
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
    const paying = commit.payment?.sessionId === s.sessionId;
    return (
      <div key={s.sessionId} className="border-b border-[var(--rule-2)] last:border-b-0">
        <div className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="min-w-0">
            <div className="text-[15px] font-semibold text-[var(--ink)]">{s.courseTitle}</div>
            <Num.ClockRange
              start={s.startTime}
              end={s.endTime}
              locale={locale}
              className="mt-0.5 flex text-xs text-[var(--ink-3)]"
            />
            {suggested ? (
              <span className="mt-1.5 inline-block">
                <Badge tone="done">{t("shared.checkin.coveredBadge")}</Badge>
              </span>
            ) : null}
          </div>
          {paying ? null : s.checkinStatus === "present" ? (
            // Already checked in today — say so instead of re-offering the
            // same commit (which was idempotent server-side but read as
            // "nothing happened yet" to the operator).
            <Badge tone="done" icon={<CheckCircle2 className="size-3.5" />}>
              {t("shared.checkin.alreadyPresent")}
            </Badge>
          ) : s.checkinStatus === "counter_only" ? (
            <Badge tone="pending" icon={<DoorOpen className="size-3.5" />}>
              {t("shared.checkin.counterDoneBadge")}
            </Badge>
          ) : s.covered ? (
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
            // A dead-end without guidance strands the operator mid-queue: name
            // the fix and who can do it, not just the state.
            <span className="max-w-[220px] text-[13px] leading-snug text-[var(--ink-3)]">
              {t("shared.checkin.noSessionPriceHint")}
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
          <div className="flex flex-wrap items-center gap-1">
            {/* Renders on any device with a camera; only a machine with none
                hides it. The typed and keyboard-wedge paths are unchanged
                either way. */}
            <QrScannerButton
              onScan={onScan}
              label={t("shared.checkin.scanCard")}
              title={t("shared.checkin.scanTitle")}
              hint={t("shared.checkin.scanHint")}
              deniedMessage={t("shared.checkin.scanDenied")}
            />
            <Button
              variant="ghost"
              className="h-11 self-start px-2 text-[13px]"
              onClick={() => setWalkInOpen((v) => !v)}
            >
              <UserPlus className="size-4" />
              {t("shared.checkin.newWalkIn")}
            </Button>
          </div>

          {walkInOpen ? (
            <WalkInPanel
              busy={busy}
              setBusy={setLocalBusy}
              onInvite={setPendingInvite}
              onCreated={async (created) => {
                setWalkInOpen(false);
                await pickStudent({
                  studentId: created.studentId,
                  name: created.fullName,
                  studentCode: created.studentCode ?? "",
                  phone: created.phone,
                  isShell: !created.existing,
                  onOurRoster: true,
                  otherCenters: [],
                });
              }}
            />
          ) : null}

          {pendingInvite ? (
            <PendingInviteCard invite={pendingInvite} onDone={() => setPendingInvite(null)} />
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
