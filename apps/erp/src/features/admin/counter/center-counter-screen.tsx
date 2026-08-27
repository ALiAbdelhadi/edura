"use client";

import { QrScannerButton } from "@/components/kit/qr-scanner-button";
import { Link } from "@/i18n/navigation";
import { api } from "@/lib/api/client";
import { useFormatters } from "@/lib/i18n/use-formatters";
import { Button } from "@repo/ui/components/button";
import { Combobox } from "@repo/ui/components/combobox";
import { Kbd } from "@repo/ui/components/kbd";
import { SearchInput } from "@repo/ui/components/search-input";
import { toast } from "@repo/ui/components/sonner";
import { Tabs, TabsList, TabsTrigger } from "@repo/ui/components/tabs";
import { cn } from "@repo/ui/lib/utils";
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
import { ShiftCard } from "./shift-card";
import {
  COUNTER_METHODS,
  useCheckinCommit,
  type CheckinTarget,
  type CounterMethod,
} from "./use-checkin-commit";
import { WalkInPanel, type WalkInInvite } from "./walk-in-panel";

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
const SEARCH_ID = "counter-student-search";
const ACTION_ATTR = "data-counter-action";

function focusSearchBox() {
  const el = document.getElementById(SEARCH_ID);
  if (el instanceof HTMLInputElement) {
    el.focus();
    el.select();
  }
}

function rosterHit(
  r: { name: string; studentCode: string | null; phone: string | null },
  term: string,
): boolean {
  return [r.name, r.studentCode, r.phone].some((v) => v?.toLowerCase().includes(term));
}

function typingInAField(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    target.isContentEditable
  );
}

const ROSTER_GRID = "grid gap-2 2xl:grid-cols-2";
const ROSTER_TOUR = "board-roster";

export function CenterCounterScreen({
  embedded = false,
}: {
  embedded?: boolean;
} = {}) {
  const t = useTranslations();
  const { formatEGP, locale } = useFormatters();
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
  const [contextOpen, setContextOpen] = useState(false);
  const [q, setQ] = useState("");
  const [matches, setMatches] = useState<Match[] | null>(null);
  const [walkInOpen, setWalkInOpen] = useState(false);
  const [pendingInvite, setPendingInvite] = useState<WalkInInvite | null>(null);
  const [localBusy, setLocalBusy] = useState(false);
  const [payMethod, setPayMethod] = useState<CounterMethod>("cash");
  const boardRef = useRef<HTMLDivElement | null>(null);

  const loadRoster = useCallback(async (sid: string): Promise<Roster | null> => {
    try {
      const res = await api.get(`center/counter/roster?sessionId=${sid}`).json<{ data: Roster }>();
      setRoster(res.data);
      return res.data;
    } catch {
      setRoster(null);
      return null;
    }
  }, []);
  const loadSessionCounts = useCallback(async (tid: string) => {
    try {
      const res = await api
        .get(`center/counter/sessions?teacherId=${tid}`)
        .json<{ data: { sessions: CounterSession[] } }>();
      setSessions(res.data.sessions);
    } catch {
    }
  }, []);

  const commit = useCheckinCommit({
    refresh: async (studentId) => {
      const [next] = await Promise.all([
        sessionId ? loadRoster(sessionId) : Promise.resolve(null),
        teacherId ? loadSessionCounts(teacherId) : Promise.resolve(),
      ]);
      const row = next?.students.find((s) => s.studentId === studentId);
      if (row && (row.attendance === "present" || row.attendance === "counter_only")) {
        setQ("");
        setMatches(null);
        focusSearchBox();
      }
    },
  });
  const busy = localBusy || commit.busy;

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

  useEffect(() => {
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
  }, [teacherId, t]);

  useEffect(() => {
    if (!sessionId) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadRoster(sessionId);
  }, [sessionId, loadRoster]);
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

  const focusFirstAction = useCallback(() => {
    requestAnimationFrame(() => {
      const el = boardRef.current?.querySelector<HTMLElement>(
        `[${ACTION_ATTR}]:not([disabled])`,
      );
      el?.focus();
    });
  }, []);
  const submitSearch = async (raw?: string) => {
    const value = (raw ?? q).trim();
    if (value.length === 0) {
      setMatches(null);
      return;
    }
    const needle = value.toLowerCase();
    const local = (roster?.students ?? []).filter((r) => rosterHit(r, needle));
    if (local.length > 0) {
      setMatches(null);
      focusFirstAction();
      return;
    }
    await runLookup(value);
  };

  const onScan = (raw: string) => {
    setQ(raw);
    void submitSearch(raw);
  };

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    if (window.matchMedia("(pointer: fine)").matches) focusSearchBox();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.key === "/" && !typingInAField(e.target)) {
        e.preventDefault();
        focusSearchBox();
        return;
      }

      if (e.key === "Escape") {
        if (commit.payment) return;
        if (q.length > 0 || matches) {
          e.preventDefault();
          setQ("");
          setMatches(null);
          focusSearchBox();
        }
        return;
      }

      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        const active = document.activeElement;
        const fromSearch = active instanceof HTMLElement && active.id === SEARCH_ID;
        const fromAction =
          active instanceof HTMLElement && active.hasAttribute(ACTION_ATTR);
        if (!fromSearch && !fromAction) return;

        const items = [
          ...(boardRef.current?.querySelectorAll<HTMLElement>(
            `[${ACTION_ATTR}]:not([disabled])`,
          ) ?? []),
        ];
        if (items.length === 0) return;
        e.preventDefault();
        const at = items.indexOf(active as HTMLElement);
        const next =
          at === -1
            ? 0
            : Math.min(Math.max(at + (e.key === "ArrowDown" ? 1 : -1), 0), items.length - 1);
        items[next]?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [q, matches, commit.payment]);

  const selectedSession = sessions?.find((s) => s.sessionId === sessionId) ?? null;
  const selectedTeacher = teachers?.find((tr) => tr.teacherId === teacherId) ?? null;
  const contextExpanded = contextOpen || !sessionId;

  const offRoster = (matches ?? []).filter(
    (m) => !roster?.students.some((s) => s.studentId === m.studentId),
  );

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
    return rows.filter((r) => rosterHit(r, term));
  };

  const isIn = (r: RosterRow) => r.attendance === "present" || r.attendance === "counter_only";
  const attended = (roster?.students ?? []).filter(isIn);
  const pending = (roster?.students ?? []).filter((r) => !isIn(r));
  const term = q.trim();
  const shown = term
    ? filtered(roster?.students ?? [])
    : tab === IN_TAB
      ? attended
      : pending;

  const payingStudentId = commit.payment?.studentId ?? null;
  useEffect(() => setPayMethod("cash"), [payingStudentId]);

  const methodLabels: Record<CounterMethod, string> = {
    cash: t("shared.checkin.methodCash"),
    instapay: t("shared.checkin.methodInstapay"),
    pos_card: t("shared.checkin.methodPosCard"),
    mobile_wallet: t("shared.checkin.methodMobileWallet"),
  };

  const paymentStep = () => {
    const price = commit.payment?.pricePerSession ?? null;
    return (
      <div className="border-t border-(--rule) bg-(--amber-soft)/40 p-4">
        <Eyebrow>{t("shared.checkin.needsPaymentTitle")}</Eyebrow>
        <p className="mt-1.5 mb-3 text-[13px] leading-relaxed text-(--ink-2)">
          {t("shared.checkin.needsPaymentBody", {
            course: commit.payment?.courseTitle ?? "",
          })}
        </p>
        {price == null ? (
          <p className="m-0 text-[13px] text-(--ink-2)">
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
              totalLabel={t("shared.checkin.amountDue")}
              totalValue={<Amount piasters={price} locale={locale} />}
            />
            <div className="mt-3">
              <p className="mb-1.5 text-[12.5px] font-medium text-(--ink-2)">
                {t("shared.checkin.methodLabel")}
              </p>
              <div className="mb-3 grid grid-cols-2 gap-2" role="radiogroup">
                {COUNTER_METHODS.map((m) => (
                  <button
                    key={m}
                    type="button"
                    role="radio"
                    aria-checked={payMethod === m}
                    onClick={() => setPayMethod(m)}
                    className={cn(
                      "h-11 rounded-lg border text-[13px] font-medium transition-colors",
                      payMethod === m
                        ? "border-(--ink) bg-(--ink) text-(--paper)"
                        : "border-(--rule) bg-(--sheet) text-(--ink-2)",
                    )}
                  >
                    {methodLabels[m]}
                  </button>
                ))}
              </div>
              <TwoStepCommit
                resetKey={commit.payment?.studentId ?? null}
                icon={<Banknote className="size-4" />}
                label={
                  payMethod === "cash"
                    ? t("shared.checkin.armCollect", { price: formatEGP(price) })
                    : t("shared.checkin.armCollectMethod", {
                        price: formatEGP(price),
                        method: methodLabels[payMethod],
                      })
                }
                armedLabel={t("shared.checkin.confirmCollect", { price: formatEGP(price) })}
                busy={busy}
                onCommit={async () => {
                  const p = commit.payment;
                  if (!p) return;
                  const target = targetOf(p.studentId, false);
                  if (target) await commit.collectAndCheckin(target, payMethod);
                }}
                anchor="viewport-bottom"
              />
              <button
                type="button"
                onClick={commit.clearPayment}
                className="mt-2 h-11 w-full rounded-lg text-[13px] font-medium text-(--ink-2)"
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
          "overflow-hidden rounded-lg border border-(--rule) bg-(--sheet)",
          paying ? "2xl:col-span-2" : null,
        )}
      >
        <div className="flex flex-col gap-2.5 px-3.5 py-2.5 sm:flex-row sm:items-center sm:gap-3">
          <div className="min-w-0 flex-1">
            <RowIdentity
              name={row.name}
              meta={[row.studentCode, row.phone].filter(Boolean).join(" · ")}
            />
          </div>
          {row.note ? <div className="sm:shrink-0">{row.note}</div> : null}
          <div className="sm:w-46.5 sm:shrink-0 sm:text-end">
            {paying ? null : row.attendance === "present" ? (
              <Badge tone="done" icon={<CheckCircle2 className="size-3.5" />}>
                {t("shared.checkin.alreadyPresent")}
              </Badge>
            ) : row.attendance === "counter_only" ? (
              <Badge tone="pending" icon={<DoorOpen className="size-3.5" />}>
                {t("shared.checkin.counterDoneBadge")}
              </Badge>
            ) : !roster ? (
              <span className="block text-[12.5px] leading-snug text-(--ink-3)">
                {t("shared.counter.pickLessonFirst")}
              </span>
            ) : row.covered ? (
              <Button
                size="lg"
                className="h-11 w-full"
                disabled={busy}
                {...{ [ACTION_ATTR]: "" }}
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
                className="h-auto min-h-11 w-full whitespace-normal px-2 py-1.5 text-[12.5px] leading-tight"
                disabled={busy}
                {...{ [ACTION_ATTR]: "" }}
                onClick={() => {
                  const target = targetOf(row.studentId, false);
                  if (target) void commit.startCheckin(target);
                }}
              >
                <Banknote className="size-4" />
                {t("shared.checkin.collectAndCheckIn", { price: formatEGP(price) })}
              </Button>
            ) : (
              <span className="block text-[12.5px] leading-snug text-(--ink-3)">
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
    <div ref={boardRef} className="mx-auto flex w-full max-w-350 flex-col gap-4">
      {embedded ? null : (
        <PageHead
          title={t("shared.counter.title")}
          subtitle={
            <span className="hidden sm:inline">{t("shared.counter.description")}</span>
          }
        />
      )}
      {embedded ? null : <ShiftCard />}
      <Sheet data-tour="board-teacher">
        {contextExpanded ? (
          <div className="flex flex-col gap-2.5 p-3.5">
            <div className="flex items-center justify-between gap-3">
              <Eyebrow>{t("shared.counter.teacherLabel")}</Eyebrow>
              {sessionId ? (
                <button
                  type="button"
                  onClick={() => setContextOpen(false)}
                  className="text-[13px] font-semibold text-(--indigo)"
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
              <p className="m-0 text-[13px] text-(--ink-3)">
                {t("shared.counter.noSessionsToday")}
              </p>
            ) : (
              <>
                <Eyebrow>{t("shared.counter.chooseLesson")}</Eyebrow>
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
                          "w-42 shrink-0 snap-start rounded-lg p-2.5 text-start",
                          active
                            ? "border-2 border-(--ink) bg-(--sheet)"
                            : "border border-(--rule) bg-(--field) hover:bg-(--rule-2)",
                        )}
                      >
                        <span className="flex items-center justify-between gap-1.5">
                          <Num.Clock
                            value={s.startTime}
                            locale={locale}
                            className="text-[13px] font-semibold text-(--ink)"
                          />
                          {s.live ? (
                            <Badge tone="done">{t("shared.counter.live")}</Badge>
                          ) : s.status === "cancelled" ? (
                            <Badge tone="failed">{t("status.cancelled")}</Badge>
                          ) : null}
                        </span>
                        <span className="mt-0.5 block truncate text-[12.5px] text-(--ink-2)">
                          {s.courseTitle}
                        </span>
                        <span className="mt-0.5 flex items-center gap-1.5">
                          <Num className="text-[11px] text-(--ink-3)">
                            {s.checkedIn}/{s.enrolled}
                          </Num>
                          {s.roomName ? (
                            <span className="truncate text-[11px] text-(--ink-3)">
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
            className="flex w-full items-center gap-3 p-3.5 text-start hover:bg-(--rule-2)"
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] font-semibold text-(--ink)">
                {roster?.session.teacherName ?? selectedTeacher?.name ?? "—"}
              </span>
              <span className="mt-0.5 flex items-center gap-1.5">
                {selectedSession ? (
                  <Num.ClockRange
                    start={selectedSession.startTime}
                    end={selectedSession.endTime}
                    locale={locale}
                    className="shrink-0 text-xs text-(--ink-3)"
                  />
                ) : null}
                <span className="truncate text-xs text-(--ink-3)">
                  {selectedSession?.courseTitle}
                  {selectedSession?.roomName ? ` · ${selectedSession.roomName}` : ""}
                </span>
              </span>
            </span>
            {selectedSession?.live ? (
              <Badge tone="done">{t("shared.counter.live")}</Badge>
            ) : null}
            <span className="shrink-0 text-[13px] font-semibold text-(--indigo)">
              {t("shared.counter.change")}
            </span>
          </button>
        )}
      </Sheet>
      <Sheet>
        <div className="flex flex-col gap-2.5 border-b border-(--rule) p-3.5">
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
          <div className="flex flex-wrap items-center gap-2" data-tour="board-search">
            <SearchInput
              id={SEARCH_ID}
              inputMode="search"
              density="touch"
              className="num min-w-50 flex-1 border-(--rule) bg-(--field)"
              placeholder={t("shared.counter.studentSearchPlaceholder")}
              value={q}
              onValueChange={(v) => {
                setQ(v);
                if (v.trim().length === 0) setMatches(null);
              }}
              onSubmit={() => void submitSearch()}
              onClear={() => {
                setQ("");
                setMatches(null);
                focusSearchBox();
              }}
              clearLabel={t("shared.counter.clearSearch")}
              action={{ label: t("actions.search"), onClick: () => void submitSearch(), busy }}
            />
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
            <Link
              href={`${portalBase}/checkin`}
              className="flex h-11 shrink-0 items-center gap-2 rounded-lg px-2.5 text-[13px] font-medium text-(--ink-2) hover:bg-(--rule-2)"
            >
              <UserSearch className="size-4" />
              {t("shared.counter.byStudent")}
            </Link>
          </div>
          <p className="m-0 hidden flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-(--ink-3) sm:flex">
            <span className="inline-flex items-center gap-1.5">
              <Kbd>/</Kbd>
              {t("shared.counter.kbdSearchHint")}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Kbd>↑</Kbd>
              <Kbd>↓</Kbd>
              {t("shared.counter.kbdRowsHint")}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Kbd>Esc</Kbd>
              {t("shared.counter.kbdEscHint")}
            </span>
          </p>
          {walkInOpen ? (
            <WalkInPanel
              busy={busy}
              setBusy={setLocalBusy}
              onInvite={setPendingInvite}
              onCreated={async (created) => {
                setWalkInOpen(false);
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
        {roster &&
          roster.session.attendanceMode === "counter_and_door" &&
          roster.counts.counterOnly > 0 ? (
          <p className="m-0 flex items-center gap-2 border-b border-(--rule-2) bg-(--amber-soft)/40 px-3.5 py-2 text-[12.5px] text-(--ink-2)">
            <DoorOpen className="size-3.5 shrink-0 text-(--amber)" />
            {t("shared.counter.awaitingDoor", { count: roster.counts.counterOnly })}
          </p>
        ) : null}
        {offRoster.length > 0 ? (
          <div className="border-b border-(--rule) bg-(--field) px-3 pb-3">
            <div className="py-2.5">
              <Eyebrow>{t("shared.counter.offRoster")}</Eyebrow>
            </div>
            <div className={ROSTER_GRID}>
              {offRoster
                .map((m) =>
                  studentRow({
                    studentId: m.studentId,
                    name: m.name ?? "—",
                    studentCode: m.studentCode,
                    phone: m.phone,
                    attendance: null,
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
          <EmptyState
            icon={<CalendarClock className="size-5" />}
            title={t("shared.counter.noLesson")}
            hint={t("shared.counter.noLessonHint")}
          />
        ) : roster === null ? (
          <div className="p-8 text-center text-[13px] text-(--ink-3)">
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
      </Sheet>
    </div>
  );
}
