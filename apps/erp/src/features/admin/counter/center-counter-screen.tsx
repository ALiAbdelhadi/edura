"use client";

import { QrScannerButton } from "@/components/kit/qr-scanner-button";
import { Link } from "@/i18n/navigation";
import { api } from "@/lib/api/client";
import { useFormatters } from "@/lib/i18n/use-formatters";
import { Button } from "@repo/ui/components/button";
import { Combobox } from "@repo/ui/components/combobox";
import { SearchInput } from "@repo/ui/components/search-input";
import { toast } from "@repo/ui/components/sonner";
import { cn } from "@repo/ui/lib/utils";
import { Tabs, TabsList, TabsTrigger } from "@repo/ui/components/tabs";
import {
  Banknote,
  CalendarClock,
  CheckCircle2,
  DoorOpen,
  RefreshCw,
  UserPlus,
  UserSearch,
  Users,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
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
  TwoStepCommit,
} from "../ledger";
import { PendingInviteCard } from "./pending-invite-card";
import { useCheckinCommit, type CheckinTarget } from "./use-checkin-commit";
import { WalkInPanel, type WalkInInvite } from "./walk-in-panel";

/**
 * لوحة الكاونتر / THE COUNTER BOARD — the center's first screen.
 *
 * The check-in screen next door starts from a STUDENT: someone hands over a
 * card, it resolves them, and it offers their lessons. That is right for a
 * walk-in and wrong for a full hall, where the operator already knows which
 * lesson is running and needs to see who is in it. This board starts from the
 * LESSON — pick the teacher (the one teaching right now is already picked),
 * and the roster is on screen before anything is searched for.
 *
 * Both screens remain. They are two doors into the same room, and neither is a
 * lesser version of the other: this one cannot serve a student whose lesson is
 * not the selected one without switching lessons, and that one cannot tell you
 * how full the hall is.
 *
 * NOTHING HERE MOVES MONEY OR MARKS ATTENDANCE ON ITS OWN. Every commit goes
 * through `useCheckinCommit`, which is the check-in screen's own flow, lifted
 * out unchanged so the two surfaces cannot drift on the one sequence where a
 * divergence charges a family twice.
 */

type CounterTeacher = {
  teacherId: string;
  name: string;
  systemStatus: string;
  sessionsToday: number;
  liveSessionId: string | null;
  nextSessionId: string | null;
  nextStartTime: string | null;
};

type CounterSession = {
  sessionId: string;
  courseId: string;
  courseTitle: string;
  roomName: string | null;
  startTime: string;
  endTime: string;
  status: string;
  live: boolean;
  pricePerSession: number | null;
  checkedIn: number;
  enrolled: number;
};

type RosterRow = {
  studentId: string;
  name: string;
  studentCode: string | null;
  phone: string | null;
  enrolled: boolean;
  covered: boolean;
  attendance: string | null;
  counterAt: string | null;
  doorAt: string | null;
};

type Roster = {
  session: {
    sessionId: string;
    courseId: string;
    courseTitle: string;
    teacherId: string;
    teacherName: string;
    roomName: string | null;
    startTime: string;
    endTime: string;
    status: string;
    live: boolean;
    pricePerSession: number | null;
    attendanceMode: string;
  };
  counts: {
    checkedIn: number;
    present: number;
    counterOnly: number;
    total: number;
    covered: number;
  };
  students: RosterRow[];
};

/** A student found by the platform-wide lookup rather than on this roster. */
type Match = {
  studentId: string;
  name: string | null;
  studentCode: string | null;
  phone: string | null;
  isShell: boolean;
  onOurRoster: boolean;
  otherCenters: string[];
};

const IN_TAB = "in";
const ALL_TAB = "all";

/**
 * TWO COLUMNS ONCE THERE IS ROOM FOR THEM.
 *
 * A roster is 8-30 people. In one column on a wide screen that is a long scroll
 * beside an empty half-page, and each row stretches until the name and its
 * button are at opposite ends of the monitor. Two columns halve the scroll and
 * keep a card at a width where the pair still reads as one thing.
 *
 * THE BREAKPOINT IS `2xl`, NOT `xl`, AND THAT NUMBER WAS EARNED. The board does
 * not get the viewport: the portal's nav takes ~310px and the shortcuts column
 * another ~340px, so at 1280px the two cards came out ~340px wide and the fixed
 * action column ate them — every student read as "…د · XS…". A card needs about
 * 450px before the name, the badge and the button can share a line, and that is
 * what 1536px leaves once the two side columns have been paid for.
 */
const ROSTER_GRID = "grid gap-2 2xl:grid-cols-2";
/** Wrapper the guided tour points at when explaining the cash step. */
const ROSTER_TOUR = "board-roster";

export function CenterCounterScreen({
  /** Set when the board sits under a page that already has a heading — the
   *  staff portal home, whose header carries the center name and the role. */
  embedded = false,
}: {
  embedded?: boolean;
} = {}) {
  const t = useTranslations();
  const { formatEGP, locale } = useFormatters();
  // The board serves the owner's portal and the staff portal, and the second
  // door lives under whichever one the operator is standing in.
  const pathname = usePathname();
  const portalBase = pathname.includes("/dashboard/staff")
    ? "/dashboard/staff"
    : "/dashboard/admin";

  const [teachers, setTeachers] = useState<CounterTeacher[] | null>(null);
  const [teacherSearch, setTeacherSearch] = useState("");
  const [teacherId, setTeacherId] = useState<string | null>(null);

  const [sessions, setSessions] = useState<CounterSession[] | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);

  const [roster, setRoster] = useState<Roster | null>(null);
  const [tab, setTab] = useState<string>(IN_TAB);
  // The context panel (teacher + lesson) is a chooser, not a header: it opens
  // on demand and whenever there is nothing chosen yet, and otherwise gives its
  // space to the roster.
  const [contextOpen, setContextOpen] = useState(false);

  const [q, setQ] = useState("");
  const [matches, setMatches] = useState<Match[] | null>(null);
  const [walkInOpen, setWalkInOpen] = useState(false);
  const [pendingInvite, setPendingInvite] = useState<WalkInInvite | null>(null);
  const [localBusy, setLocalBusy] = useState(false);

  const loadRoster = useCallback(async (sid: string) => {
    try {
      const res = await api.get(`center/counter/roster?sessionId=${sid}`).json<{ data: Roster }>();
      setRoster(res.data);
    } catch {
      setRoster(null);
    }
  }, []);

  /**
   * Re-reads the day's counts WITHOUT touching the selection.
   *
   * The chips carry `checkedIn/enrolled` per lesson, and a check-in changes
   * both — a walk-in who pays for one lesson joins its roster as well. Leaving
   * the chips alone after a commit left "1/8" printed above a list that said 2
   * of 9, and two numbers for one fact is the defect this product treats as
   * serious. Reading the response's `defaultSessionId` here would be the other
   * failure: it would yank the operator to the live lesson mid-queue.
   */
  const loadSessionCounts = useCallback(async (tid: string) => {
    try {
      const res = await api
        .get(`center/counter/sessions?teacherId=${tid}`)
        .json<{ data: { sessions: CounterSession[] } }>();
      setSessions(res.data.sessions);
    } catch {
      // The roster below is the authority on screen; a stale chip is not worth
      // a red toast in the middle of a queue.
    }
  }, []);

  const commit = useCheckinCommit({
    // The board's unit is the LESSON, so a commit re-reads the lesson: the row
    // that just changed, the two tab counts, and everyone else's coverage in
    // one request rather than one per student — plus the day's chips, which
    // count the same event.
    refresh: async () => {
      if (sessionId) await loadRoster(sessionId);
      if (teacherId) await loadSessionCounts(teacherId);
    },
  });
  const busy = localBusy || commit.busy;

  // ── The teacher picker ────────────────────────────────────────────────────
  // Loaded once with no term, then re-loaded as the operator types. The
  // SELECTION is never touched by a re-load: narrowing the list to look
  // somebody up must not silently change whose lesson is on screen.
  //
  // `touched` records that the OPERATOR chose (or cleared) a teacher, so a
  // later list refresh never overrides them. It is deliberately not "have we
  // defaulted once yet": a ref survives React's development remount while the
  // state does not, so that version defaulted on the first mount, had its
  // state thrown away, and then refused to default again — leaving the picker
  // permanently empty with a perfectly good `defaultTeacherId` in hand.
  const touched = useRef(false);
  useEffect(() => {
    const term = teacherSearch.trim();
    const timer = setTimeout(
      () => {
        void (async () => {
          try {
            const res = await api
              .get(`center/counter/teachers${term ? `?q=${encodeURIComponent(term)}` : ""}`)
              .json<{ data: { teachers: CounterTeacher[]; defaultTeacherId: string | null } }>();
            setTeachers(res.data.teachers);
            if (!touched.current) {
              // The teacher on now, or the one due next. Null out of hours —
              // a default guessed from nothing looks chosen, and the operator
              // would take it for an answer. Applied as a functional update so
              // running twice is the same as running once.
              setTeacherId(
                (cur) =>
                  cur ?? res.data.defaultTeacherId ?? res.data.teachers[0]?.teacherId ?? null,
              );
            }
          } catch {
            setTeachers([]);
          }
        })();
      },
      term ? 250 : 0,
    );
    return () => clearTimeout(timer);
  }, [teacherSearch]);

  // ── That teacher's day ────────────────────────────────────────────────────
  useEffect(() => {
    // Clearing when the picker is cleared is the PICKER's job (see its
    // onChange) — an effect that writes state on its own guard turns one user
    // action into a cascade of renders.
    if (!teacherId) return;
    void (async () => {
      setLocalBusy(true);
      try {
        const res = await api
          .get(`center/counter/sessions?teacherId=${teacherId}`)
          .json<{ data: { sessions: CounterSession[]; defaultSessionId: string | null } }>();
        setSessions(res.data.sessions);
        setSessionId(res.data.defaultSessionId);
        setRoster(null);
        setMatches(null);
        commit.clearPayment();
      } catch (err) {
        setSessions([]);
        setSessionId(null);
        toast.error((err as Error)?.message || t("shared.counter.loadFailed"));
      } finally {
        setLocalBusy(false);
      }
    })();
    // `commit` is rebuilt on every render, so listing it here would re-fetch
    // the teacher's day on every keystroke anywhere on the screen. The teacher
    // is what this depends on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teacherId, t]);

  // ── That lesson's roster ──────────────────────────────────────────────────
  useEffect(() => {
    if (!sessionId) return;
    // A read, not a state sync: the lesson on screen changed, so the roster is
    // fetched for it. `loadRoster` is stable (useCallback with no deps).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadRoster(sessionId);
  }, [sessionId, loadRoster]);

  /** The platform-wide search, for a student this lesson's roster has never
   *  seen — a transfer, a sibling's card, a walk-in from another center. */
  const runLookup = async (term: string) => {
    const value = term.trim();
    if (value.length < 2) return;
    setLocalBusy(true);
    try {
      const res = await api
        .get(`center/checkin/lookup?q=${encodeURIComponent(value)}`)
        .json<{ data: Match[] }>();
      setMatches(res.data);
    } catch (err) {
      toast.error((err as Error)?.message || t("shared.checkin.searchFailed"));
    } finally {
      setLocalBusy(false);
    }
  };

  const onScan = (raw: string) => {
    setQ(raw);
    void runLookup(raw);
  };

  const selectedSession = sessions?.find((s) => s.sessionId === sessionId) ?? null;
  const selectedTeacher = teachers?.find((tr) => tr.teacherId === teacherId) ?? null;
  const contextExpanded = contextOpen || !sessionId;

  /**
   * A row, expressed as the thing the commit hook acts on.
   *
   * `covered` for a roster row is the server's own answer. For a row that came
   * from the platform-wide lookup we do not know, so it is sent as covered and
   * the SERVER decides: an uncovered student comes back `needs_payment` and
   * lands on the collection step. Guessing "uncovered" here would prompt for
   * cash from a family who had already paid.
   */
  const targetOf = (studentId: string, covered: boolean): CheckinTarget | null =>
    roster
      ? {
          studentId,
          sessionId: roster.session.sessionId,
          courseId: roster.session.courseId,
          courseTitle: roster.session.courseTitle,
          pricePerSession: roster.session.pricePerSession,
          covered,
        }
      : null;

  const filtered = (rows: RosterRow[]) => {
    const term = q.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((r) =>
      [r.name, r.studentCode, r.phone].some((v) => v?.toLowerCase().includes(term)),
    );
  };

  /*
    THE TWO TABS ARE A PARTITION, not a list and a superset.
    `checked in` + `not checked in` = the roster, so the counts add up and every
    student is in exactly one of them. The earlier second tab was "everyone",
    which made tab 1 a subset of tab 2: two views of the same rows, and no
    single place that answered the question the counter actually asks — who is
    still owed. Nobody becomes unreachable, because the SEARCH below spans the
    whole roster regardless of which tab is open.
  */
  const isIn = (r: RosterRow) => r.attendance === "present" || r.attendance === "counter_only";
  const attended = (roster?.students ?? []).filter(isIn);
  const pending = (roster?.students ?? []).filter((r) => !isIn(r));
  const term = q.trim();
  // A search is a question about the LESSON, not about the open tab: typing a
  // name that has already been checked in must find them from either side.
  const shown = term
    ? filtered(roster?.students ?? [])
    : tab === IN_TAB
      ? attended
      : pending;

  // ── The payment step, inside the row it belongs to ────────────────────────
  const paymentStep = () => {
    const price = commit.payment?.pricePerSession ?? null;
    return (
      <div className="border-t border-[var(--rule)] bg-[var(--amber-soft)]/40 p-4">
        <Eyebrow>{t("shared.checkin.needsPaymentTitle")}</Eyebrow>
        <p className="mt-1.5 mb-3 text-[13px] leading-relaxed text-[var(--ink-2)]">
          {t("shared.checkin.needsPaymentBody", {
            course: commit.payment?.courseTitle ?? "",
          })}
        </p>

        {price == null ? (
          <p className="m-0 text-[13px] text-[var(--ink-2)]">
            {t("shared.checkin.noSessionPriceHint")}
          </p>
        ) : (
          <>
            <Computation
              lines={[
                {
                  label: commit.payment?.courseTitle ?? "",
                  value: <Amount piasters={price} locale={locale} />,
                },
              ]}
              totalLabel={t("shared.checkin.cashDue")}
              totalValue={<Amount piasters={price} locale={locale} />}
            />
            <div className="mt-3">
              <TwoStepCommit
                // Row change disarms: the key is the student being paid for.
                resetKey={commit.payment?.studentId ?? null}
                icon={<Banknote className="size-4" />}
                label={t("shared.checkin.armCollect", { price: formatEGP(price) })}
                armedLabel={t("shared.checkin.confirmCollect", { price: formatEGP(price) })}
                busy={busy}
                onCommit={async () => {
                  const p = commit.payment;
                  if (!p) return;
                  const target = targetOf(p.studentId, false);
                  if (target) await commit.collectAndCheckin(target);
                }}
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

  const studentRow = (row: {
    studentId: string;
    name: string;
    studentCode: string | null;
    phone: string | null;
    attendance: string | null;
    covered: boolean;
    note?: React.ReactNode;
  }) => {
    const paying = commit.payment?.studentId === row.studentId;
    const price = selectedSession?.pricePerSession ?? roster?.session.pricePerSession ?? null;
    return (
      <div
        key={row.studentId}
        className={cn(
          "overflow-hidden rounded-lg border border-[var(--rule)] bg-[var(--sheet)]",
          // The open payment step spans the full grid: a card that grows to
          // twice its neighbours' height while they sit beside it drags the
          // whole row with it, and the operator loses their place mid-commit.
          paying ? "2xl:col-span-2" : null,
        )}
      >
        {/*
          Two columns, not `justify-between`. Spread across a wide sheet, the
          name sat at one edge of the screen and its button at the other, and
          the operator's eye had to cross the whole row to pair them. The
          action column is FIXED, so every button in the list lands in the same
          place — a queue is worked by muscle memory, not by reading. Below
          `sm` it drops under the name at full width, where a thumb is.
        */}
        <div className="flex flex-col gap-2.5 px-3.5 py-2.5 sm:flex-row sm:items-center sm:gap-3">
          <div className="min-w-0 flex-1">
            <RowIdentity
              name={row.name}
              meta={[row.studentCode, row.phone].filter(Boolean).join(" · ")}
            />
          </div>
          {/* The badge travels WITH the action rather than sitting under the
              name. Under the name it added a third line to every row and left
              the middle of a 768px sheet empty; beside the button it fills that
              gutter and the row loses a line. */}
          {row.note ? <div className="sm:shrink-0">{row.note}</div> : null}
          <div className="sm:w-[186px] sm:shrink-0 sm:text-end">
            {paying ? null : row.attendance === "present" ? (
              <Badge tone="done" icon={<CheckCircle2 className="size-3.5" />}>
                {t("shared.checkin.alreadyPresent")}
              </Badge>
            ) : row.attendance === "counter_only" ? (
              <Badge tone="pending" icon={<DoorOpen className="size-3.5" />}>
                {t("shared.checkin.counterDoneBadge")}
              </Badge>
            ) : !roster ? (
              <span className="block text-[12.5px] leading-snug text-[var(--ink-3)]">
                {t("shared.counter.pickLessonFirst")}
              </span>
            ) : row.covered ? (
              <Button
                size="lg"
                className="h-11 w-full"
                disabled={busy}
                onClick={() => {
                  const target = targetOf(row.studentId, true);
                  if (target) void commit.startCheckin(target);
                }}
              >
                <CheckCircle2 className="size-4" />
                {t("shared.checkin.checkIn")}
              </Button>
            ) : price != null ? (
              <Button
                size="lg"
                variant="outline"
                // WRAPS RATHER THAN CLIPS. "Collect 75 EGP & check in" is
                // longer than the fixed action column, and a button whose
                // label is cut off mid-word beside a money figure is the one
                // place in this app that must never be ambiguous.
                className="h-auto min-h-11 w-full whitespace-normal px-2 py-1.5 text-[12.5px] leading-tight"
                disabled={busy}
                onClick={() => {
                  const target = targetOf(row.studentId, false);
                  if (target) void commit.startCheckin(target);
                }}
              >
                <Banknote className="size-4" />
                {t("shared.checkin.collectAndCheckIn", { price: formatEGP(price) })}
              </Button>
            ) : (
              // A dead end without guidance strands the operator mid-queue: name
              // the fix and who can do it, not just the state.
              <span className="block text-[12.5px] leading-snug text-[var(--ink-3)]">
                {t("shared.checkin.noSessionPriceHint")}
              </span>
            )}
          </div>
        </div>
        {paying ? paymentStep() : null}
      </div>
    );
  };

  const teacherOptions = (teachers ?? []).map((tr) => ({
    value: tr.teacherId,
    label: tr.liveSessionId
      ? `${tr.name} · ${t("shared.counter.nowSuffix")}`
      : tr.nextStartTime
        ? `${tr.name} · ${tr.nextStartTime}`
        : tr.name,
  }));

  return (
    /*
      FILL THE WIDTH, don't sit in a 768px column with the page empty either
      side — but capped, in BOTH modes, because an ultrawide monitor would
      otherwise stretch a roster row to a metre. The cap used to be standalone-
      only, when the staff home still had a side column to share the width
      with; that column is gone, so embedded needs it too.
    */
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-4">
      {embedded ? null : (
        <PageHead
          title={t("shared.counter.title")}
          // The explanation earns its line on a desk and costs a sixth of a
          // phone screen at the counter, where the top bar already names the
          // page and the operator has read it once.
          subtitle={
            <span className="hidden sm:inline">{t("shared.counter.description")}</span>
          }
        />
      )}

      {/*
        ── 1. CONTEXT, COLLAPSED ───────────────────────────────────────────
        Which teacher and which lesson is a decision taken once at the start
        of a shift and then almost never revisited, but it was occupying the
        top half of the screen: a full-width picker, a label, and a wrapped
        grid of three-line cards. The operator scrolled past all of it to
        reach the first child, every single time.

        So it collapses to ONE LINE the moment a lesson is chosen — teacher,
        time, group, room — and reopens on a tap. It opens automatically when
        nothing is selected, because then it IS the task.
      */}
      <Sheet data-tour="board-teacher">
        {contextExpanded ? (
          <div className="flex flex-col gap-2.5 p-3.5">
            <div className="flex items-center justify-between gap-3">
              <Eyebrow>{t("shared.counter.teacherLabel")}</Eyebrow>
              {sessionId ? (
                <button
                  type="button"
                  onClick={() => setContextOpen(false)}
                  className="text-[13px] font-semibold text-[var(--indigo)]"
                >
                  {t("shared.counter.doneChoosing")}
                </button>
              ) : null}
            </div>
            <Combobox
              options={teacherOptions}
              value={teacherId}
              onChange={(v) => {
                touched.current = true;
                setTeacherId(v);
                // Clearing is the ACT's job, not a late response's — see the
                // note on the sessions effect.
                setMatches(null);
                commit.clearPayment();
                if (!v) {
                  setSessions(null);
                  setSessionId(null);
                  setRoster(null);
                }
              }}
              placeholder={t("shared.counter.teacherPlaceholder")}
              searchPlaceholder={t("shared.counter.teacherSearch")}
              emptyText={t("shared.counter.noTeachers")}
              search={teacherSearch}
              onSearchChange={setTeacherSearch}
            />

            {sessions === null ? null : sessions.length === 0 ? (
              <p className="m-0 text-[13px] text-[var(--ink-3)]">
                {t("shared.counter.noSessionsToday")}
              </p>
            ) : (
              <>
                <Eyebrow>{t("shared.counter.chooseLesson")}</Eyebrow>
                {/*
                  ONE ROW THAT SCROLLS, not a wrapping grid. Wrapped cards
                  reflowed into a different shape for every teacher — two here,
                  one orphaned below there — so the same control was never in
                  the same place twice. The negative margin lets the strip bleed
                  to the sheet's edge, which is what tells a thumb there is more
                  of it off-screen.
                */}
                <div className="-mx-3.5 flex snap-x gap-2 overflow-x-auto px-3.5 pb-1">
                  {sessions.map((s) => {
                    const active = s.sessionId === sessionId;
                    return (
                      <button
                        key={s.sessionId}
                        type="button"
                        onClick={() => {
                          setSessionId(s.sessionId);
                          setMatches(null);
                          commit.clearPayment();
                          setContextOpen(false);
                        }}
                        aria-pressed={active}
                        className={cn(
                          "w-[168px] shrink-0 snap-start rounded-lg p-2.5 text-start",
                          active
                            ? "border-2 border-[var(--ink)] bg-[var(--sheet)]"
                            : "border border-[var(--rule)] bg-[var(--field)] hover:bg-[var(--rule-2)]",
                        )}
                      >
                        <span className="flex items-center justify-between gap-1.5">
                          <Num.Clock
                            value={s.startTime}
                            locale={locale}
                            className="text-[13px] font-semibold text-[var(--ink)]"
                          />
                          {s.live ? (
                            <Badge tone="done">{t("shared.counter.live")}</Badge>
                          ) : s.status === "cancelled" ? (
                            <Badge tone="failed">{t("status.cancelled")}</Badge>
                          ) : null}
                        </span>
                        <span className="mt-0.5 block truncate text-[12.5px] text-[var(--ink-2)]">
                          {s.courseTitle}
                        </span>
                        <span className="mt-0.5 flex items-center gap-1.5">
                          <Num className="text-[11px] text-[var(--ink-3)]">
                            {s.checkedIn}/{s.enrolled}
                          </Num>
                          {s.roomName ? (
                            <span className="truncate text-[11px] text-[var(--ink-3)]">
                              · {s.roomName}
                            </span>
                          ) : null}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setContextOpen(true)}
            className="flex w-full items-center gap-3 p-3.5 text-start hover:bg-[var(--rule-2)]"
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] font-semibold text-[var(--ink)]">
                {roster?.session.teacherName ?? selectedTeacher?.name ?? "—"}
              </span>
              <span className="mt-0.5 flex items-center gap-1.5">
                {selectedSession ? (
                  <Num.ClockRange
                    start={selectedSession.startTime}
                    end={selectedSession.endTime}
                    locale={locale}
                    className="shrink-0 text-xs text-[var(--ink-3)]"
                  />
                ) : null}
                <span className="truncate text-xs text-[var(--ink-3)]">
                  {selectedSession?.courseTitle}
                  {selectedSession?.roomName ? ` · ${selectedSession.roomName}` : ""}
                </span>
              </span>
            </span>
            {selectedSession?.live ? (
              <Badge tone="done">{t("shared.counter.live")}</Badge>
            ) : null}
            <span className="shrink-0 text-[13px] font-semibold text-[var(--indigo)]">
              {t("shared.counter.change")}
            </span>
          </button>
        )}
      </Sheet>

      {/*
        ── 2. THE WORK — the rest of the screen belongs to it ───────────
        RENDERED UNCONDITIONALLY. It used to be gated on a chosen lesson, so a
        teacher with nothing scheduled today took the tabs, the student search
        AND the walk-in door off the screen with them — the operator was left
        holding a picker with nothing to do, which reads as a broken page rather
        than as an empty schedule. Only the ROSTER depends on a lesson;
        searching for a student and registering a new one never did.
      */}
      <Sheet>
          <div className="flex flex-col gap-2.5 border-b border-[var(--rule)] p-3.5">
            {/* The two tabs and the two counts, on the row a queue is judged
                from. Refresh sits with them because it acts on THEM. */}
            <div className="flex items-center gap-2" data-tour="board-tabs">
              <Tabs value={tab} onValueChange={setTab} className="min-w-0 flex-1">
                <TabsList className="w-full">
                  <TabsTrigger value={IN_TAB} className="min-w-0 flex-1">
                    <span className="truncate">{t("shared.counter.tabAttended")}</span>
                    <Num className="ms-1.5 text-[12px] font-semibold">
                      {roster ? roster.counts.checkedIn : 0}
                    </Num>
                  </TabsTrigger>
                  <TabsTrigger value={ALL_TAB} className="min-w-0 flex-1">
                    <span className="truncate">{t("shared.counter.tabPending")}</span>
                    <Num className="ms-1.5 text-[12px] font-semibold">{pending.length}</Num>
                  </TabsTrigger>
                </TabsList>
              </Tabs>
              <Button
                variant="ghost"
                size="icon"
                className="size-11 shrink-0"
                aria-label={t("shared.counter.refresh")}
                title={t("shared.counter.refresh")}
                disabled={busy}
                onClick={() => {
                  if (sessionId) void loadRoster(sessionId);
                  if (teacherId) void loadSessionCounts(teacherId);
                }}
              >
                <RefreshCw className="size-4" />
              </Button>
            </div>

            {/* Finding a student is ONE row: the box, the camera that fills it,
                and the door for someone who is not in the system yet. They used
                to be stacked on three, which pushed the first child further
                down for no reason — they are all the same question. */}
            <div className="flex flex-wrap items-center gap-2" data-tour="board-search">
              <SearchInput
                inputMode="search"
                density="touch"
                className="num min-w-[200px] flex-1 border-[var(--rule)] bg-[var(--field)]"
                placeholder={t("shared.counter.studentSearchPlaceholder")}
                value={q}
                onValueChange={(v) => {
                  setQ(v);
                  if (v.trim().length === 0) setMatches(null);
                }}
                onSubmit={() => runLookup(q)}
                action={{ label: t("actions.search"), onClick: () => runLookup(q), busy }}
              />
              {/* Renders on any device with a camera; only a machine with none
                  hides it. The typed and keyboard-wedge paths are unchanged
                  either way. */}
              <QrScannerButton
                onScan={onScan}
                label={t("shared.checkin.scanCard")}
                title={t("shared.checkin.scanTitle")}
                hint={t("shared.checkin.scanHint")}
                deniedMessage={t("shared.checkin.scanDenied")}
                className="h-11 shrink-0 px-2.5 text-[13px]"
              />
              <Button
                variant="outline"
                className="h-11 shrink-0 px-2.5 text-[13px]"
                data-tour="board-walkin"
                onClick={() => setWalkInOpen((v) => !v)}
              >
                <UserPlus className="size-4" />
                {t("shared.checkin.newWalkIn")}
              </Button>
              {/*
                THE SECOND DOOR, reached from the first instead of from a second
                nav entry. The check-in screen answers a different question —
                "this student is in front of me, which of THEIR lessons is it?"
                — and both portals used to list it beside the board, so the
                sidebar advertised two ways to check somebody in and left the
                operator to work out which. The page is unchanged and nothing it
                does was removed; it is simply reached at the moment you need
                it, which is while looking a student up.
              */}
              <Link
                href={`${portalBase}/checkin`}
                className="flex h-11 shrink-0 items-center gap-2 rounded-lg px-2.5 text-[13px] font-medium text-[var(--ink-2)] hover:bg-[var(--rule-2)]"
              >
                <UserSearch className="size-4" />
                {t("shared.counter.byStudent")}
              </Link>
            </div>

            {walkInOpen ? (
              <WalkInPanel
                busy={busy}
                setBusy={setLocalBusy}
                onInvite={setPendingInvite}
                onCreated={async (created) => {
                  setWalkInOpen(false);
                  // A brand-new student is on nobody's roster yet, so the board
                  // would have nowhere to show them. Surface them as a lookup
                  // result instead — the same row, with the same actions,
                  // pointed at the lesson that is already selected.
                  setQ(created.studentCode ?? created.phone);
                  setMatches([
                    {
                      studentId: created.studentId,
                      name: created.fullName,
                      studentCode: created.studentCode,
                      phone: created.phone,
                      isShell: !created.existing,
                      onOurRoster: true,
                      otherCenters: [],
                    },
                  ]);
                  if (sessionId) await loadRoster(sessionId);
                }}
              />
            ) : null}

            {pendingInvite ? (
              <PendingInviteCard invite={pendingInvite} onDone={() => setPendingInvite(null)} />
            ) : null}
          </div>

          {/* The door stage, where it is actionable — beside the list it
              describes, not in a footer nobody scrolls to. */}
          {roster &&
          roster.session.attendanceMode === "counter_and_door" &&
          roster.counts.counterOnly > 0 ? (
            <p className="m-0 flex items-center gap-2 border-b border-[var(--rule-2)] bg-[var(--amber-soft)]/40 px-3.5 py-2 text-[12.5px] text-[var(--ink-2)]">
              <DoorOpen className="size-3.5 shrink-0 text-[var(--amber)]" />
              {t("shared.counter.awaitingDoor", { count: roster.counts.counterOnly })}
            </p>
          ) : null}

          {/* Students found off the roster — shown above it, because they are
              what the operator just went looking for. */}
          {matches && matches.length > 0 ? (
            <div className="border-b border-[var(--rule)] bg-[var(--field)] px-3 pb-3">
              <div className="py-2.5">
                <Eyebrow>{t("shared.counter.offRoster")}</Eyebrow>
              </div>
              <div className={ROSTER_GRID}>
              {matches
                .filter((m) => !roster?.students.some((s) => s.studentId === m.studentId))
                .map((m) =>
                  studentRow({
                    studentId: m.studentId,
                    name: m.name ?? "—",
                    studentCode: m.studentCode,
                    phone: m.phone,
                    attendance: null,
                    // Unknown here — the server decides. See `targetOf`.
                    covered: true,
                    note: m.onOurRoster ? (
                      <Badge tone="done">{t("shared.checkin.ourStudent")}</Badge>
                    ) : m.otherCenters.length > 0 ? (
                      <Badge tone="pending">
                        {t("shared.checkin.knownElsewhere", { center: m.otherCenters[0] })}
                      </Badge>
                    ) : (
                      <Badge tone="neutral">{t("shared.checkin.newHere")}</Badge>
                    ),
                  }),
                )}
              </div>
            </div>
          ) : null}

          {!sessionId ? (
            // No lesson chosen (or none today). The roster genuinely cannot
            // exist — but say so, rather than spinning on a fetch that will
            // never be made, and point at the two things that DO still work.
            <EmptyState
              icon={<CalendarClock className="size-5" />}
              title={t("shared.counter.noLesson")}
              hint={t("shared.counter.noLessonHint")}
            />
          ) : roster === null ? (
            <div className="p-8 text-center text-[13px] text-[var(--ink-3)]">
              {t("centerStaff.loading")}
            </div>
          ) : shown.length === 0 ? (
            <EmptyState
              icon={<Users className="size-5" />}
              title={
                term
                  ? t("shared.counter.noStudentMatch")
                  : tab === IN_TAB
                    ? t("shared.counter.noneAttended")
                    : roster.counts.total === 0
                      ? t("shared.counter.emptyRoster")
                      : t("shared.counter.nonePending")
              }
              hint={term ? t("shared.counter.noStudentMatchHint") : undefined}
            />
          ) : (
            <div className={cn(ROSTER_GRID, "p-3")} data-tour={ROSTER_TOUR}>
              {shown.map((s) =>
                studentRow({
                  studentId: s.studentId,
                  name: s.name,
                  studentCode: s.studentCode,
                  phone: s.phone,
                  attendance: s.attendance,
                  covered: s.covered,
                  note: !s.enrolled ? (
                    <Badge tone="neutral">{t("shared.counter.notEnrolled")}</Badge>
                  ) : !s.covered && s.attendance === null ? (
                    <Badge tone="pending">{t("shared.counter.unpaid")}</Badge>
                  ) : null,
                }),
              )}
            </div>
          )}

          {/*
            NO FOOTER SUMMARY. It used to repeat "n of m checked in" under the
            list — the same two numbers the tabs already carry, a scroll away
            from where they are read, and one more thing to keep in agreement.
            The door line moved ABOVE the list for the same reason: a status
            nobody scrolls to is not a status.
          */}
      </Sheet>
    </div>
  );
}
