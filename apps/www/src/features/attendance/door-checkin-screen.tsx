"use client";

// Door check-in (Step 6) — the assistant confirms counter-passed students at
// the classroom door (the teacher's own account works as fallback).
//
// This is the product's only `touch` surface, and it is a different design
// problem from every other screen: someone standing at a doorway, one-handed,
// with forty teenagers arriving at once. So it runs the Ledger at TOUCH
// density — 48px minimum targets, 16px minimum body type, 12px minimum gaps,
// and nothing actionable below 16px. A 12px "Confirm" that works fine with a
// mouse is unusable with a thumb and a queue.
//
// ── The commit-state indicator ─────────────────────────────────────────────
//
// The failure mode this screen has to design against is specific and named:
// *a receptionist who cannot tell whether a check-in committed will check the
// student in twice.* Previously the only feedback was a toast plus a full
// roster refetch, so during the round-trip a row looked exactly as it did
// before the press — and the natural response to that is to press again.
//
// Every row now carries its OWN commit state (idle → committing → committed →
// failed, with a retry). The seal is the system's one animation, and this is
// exactly the moment it exists for: the instant something became permanent.
//
// No two-step commit here, deliberately. The two-step ceremony is for
// irreversible money; a door check-in is idempotent by design (Step 6) and
// happens forty times in five minutes. Making each one a confirm dialog would
// buy no safety and cost the whole queue.
import { useCallback, useEffect, useState } from "react";
import { AlertCircle, Check, DoorOpen } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { toast } from "@repo/ui/components/sonner";
import { cn } from "@repo/ui/lib/utils";
import {
  Figure,
  LoadError,
  SectionHead,
  SkeletonRows,
} from "@repo/ui/components/ledger";
import { api } from "@/lib/api/client";
import { PageHeader } from "@/components/kit/page-header";
import { Spinner } from "@/components/kit/spinner";

type DoorRow = {
  studentId: string;
  name: string;
  studentCode: string | null;
  status: string;
  counterAt: string | null;
  doorAt: string | null;
};

type SessionRow = {
  id: string;
  courseTitle?: string;
  startTime: string;
  endTime: string;
  date: string;
};

/** Per-record, so one student's failure never reads as another's. */
type CommitState = "committing" | "committed" | "failed";

type Async<T> = { status: "loading" } | { status: "error" } | { status: "ok"; data: T };
const LOADING = { status: "loading" } as const;
const FAILED = { status: "error" } as const;

export function DoorCheckinScreen() {
  const t = useTranslations();

  const [sessions, setSessions] = useState<Async<SessionRow[]>>(LOADING);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [roster, setRoster] = useState<Async<DoorRow[]>>(LOADING);
  const [code, setCode] = useState("");
  const [commits, setCommits] = useState<Record<string, CommitState>>({});
  const [scanBusy, setScanBusy] = useState(false);

  const loadSessions = useCallback(async () => {
    setSessions(LOADING);
    try {
      const today = new Date().toISOString().slice(0, 10);
      const res = await api
        .get(`sessions?from=${today}&to=${today}`)
        .json<{ data: { items?: SessionRow[] } | SessionRow[] }>();
      const items = Array.isArray(res.data) ? res.data : (res.data.items ?? []);
      setSessions({ status: "ok", data: items });
    } catch {
      setSessions(FAILED);
    }
  }, []);

  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  const loadRoster = useCallback(
    async (sid: string) => {
      setRoster(LOADING);
      try {
        const res = await api
          .get(`door-checkin?sessionId=${sid}`)
          .json<{ data: DoorRow[] }>();
        setRoster({ status: "ok", data: res.data });
      } catch {
        // Was a toast plus a permanent spinner: the roster stayed null, so
        // "failed" and "still loading" looked identical forever.
        setRoster(FAILED);
      }
    },
    [],
  );

  const pickSession = (sid: string) => {
    setSessionId(sid);
    setCommits({});
    void loadRoster(sid);
  };

  /**
   * Confirm one student.
   *
   * `studentId` keys the per-row state. The scan path has no row yet, so it
   * uses the code-entry spinner instead. The row is marked `committed`
   * BEFORE the refetch so the seal lands immediately rather than after a
   * round-trip — the operator's next press must not be a guess.
   */
  const confirm = async (
    input: { studentId?: string; studentCode?: string },
  ) => {
    if (!sessionId) return;
    const key = input.studentId;
    if (key) setCommits((c) => ({ ...c, [key]: "committing" }));
    else setScanBusy(true);

    try {
      await api
        .post("door-checkin", { json: { ...input, sessionId } })
        .json<unknown>();
      if (key) setCommits((c) => ({ ...c, [key]: "committed" }));
      else {
        toast.success(t("shared.door.confirmed"));
        setCode("");
      }
      await loadRoster(sessionId);
    } catch (err: any) {
      if (key) setCommits((c) => ({ ...c, [key]: "failed" }));
      else toast.error(err?.message || t("shared.door.failed"));
    } finally {
      if (!key) setScanBusy(false);
    }
  };

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-5">
      <PageHeader
        title={t("shared.door.title")}
        description={t("shared.door.description")}
      />

      <section className="flex flex-col gap-3">
        <SectionHead title={t("shared.door.pickSession")} />
        {sessions.status === "loading" ? (
          <SkeletonRows rows={2} />
        ) : sessions.status === "error" ? (
          <LoadError
            message={t("shared.door.sessionsFailed")}
            onRetry={loadSessions}
            retryLabel={t("shared.door.retry")}
          />
        ) : sessions.data.length === 0 ? (
          <p className="text-base text-ink-2">{t("shared.door.noSessions")}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {sessions.data.map((s) => {
              const active = sessionId === s.id;
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => pickSession(s.id)}
                    // touch: 56px, well clear of the 48px floor.
                    className={cn(
                      "flex min-h-14 w-full items-center justify-between gap-3 rounded-xl border px-4 py-3 text-start text-base",
                      "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo",
                      active
                        ? "border-indigo bg-indigo-soft font-semibold text-indigo"
                        : "border-rule bg-sheet text-ink",
                    )}
                  >
                    <span className="min-w-0 truncate">
                      {(s as any).courseTitle ??
                        (s as any).courseName ??
                        t("shared.door.session")}
                    </span>
                    <Figure className="shrink-0 text-base text-ink-2">
                      {s.startTime}–{s.endTime}
                    </Figure>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {sessionId ? (
        <>
          <section className="flex flex-col gap-3">
            <SectionHead
              eyebrow={t("shared.door.scanEyebrow")}
              title={
                <span className="flex items-center gap-2">
                  <DoorOpen className="size-4" aria-hidden />
                  {t("shared.door.atTheDoor")}
                </span>
              }
            />
            <div className="flex gap-3">
              <Input
                // A student code is a figure: mono, LTR, and at touch size.
                className="num h-14 flex-1 text-base"
                dir="ltr"
                inputMode="text"
                autoCapitalize="characters"
                aria-label={t("shared.door.codePlaceholder")}
                placeholder={t("shared.door.codePlaceholder")}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                onKeyDown={(e) =>
                  e.key === "Enter" &&
                  code.trim() &&
                  void confirm({ studentCode: code.trim() })
                }
              />
              <Button
                size="lg"
                className="h-14 px-6 text-base"
                disabled={scanBusy || !code.trim()}
                onClick={() => void confirm({ studentCode: code.trim() })}
              >
                {scanBusy ? <Spinner /> : <Check className="size-5" />}
                {t("shared.door.confirm")}
              </Button>
            </div>
          </section>

          <section className="flex flex-col gap-3">
            <SectionHead title={t("shared.door.rosterEyebrow")} />
            {roster.status === "loading" ? (
              <SkeletonRows rows={4} />
            ) : roster.status === "error" ? (
              <LoadError
                message={t("shared.door.loadFailed")}
                onRetry={() => void loadRoster(sessionId)}
                retryLabel={t("shared.door.retry")}
              />
            ) : roster.data.length === 0 ? (
              <p className="text-base text-ink-2">
                {t("shared.door.emptyRoster")}
              </p>
            ) : (
              <ul className="flex flex-col gap-3">
                {roster.data.map((r) => (
                  <DoorRowItem
                    key={r.studentId}
                    row={r}
                    commit={commits[r.studentId]}
                    onConfirm={() => void confirm({ studentId: r.studentId })}
                  />
                ))}
              </ul>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}

function DoorRowItem({
  row: r,
  commit,
  onConfirm,
}: {
  row: DoorRow;
  commit?: CommitState;
  onConfirm: () => void;
}) {
  const t = useTranslations();
  // Server truth wins over local state: once the refetch confirms doorAt, the
  // row is done regardless of what this tab remembers.
  const done = Boolean(r.doorAt) || commit === "committed";
  const atCounter = Boolean(r.counterAt);

  return (
    <li
      className={cn(
        "flex min-h-16 items-center justify-between gap-3 rounded-xl border p-3",
        commit === "failed"
          ? "border-red bg-red-soft"
          : done
            ? "border-rule bg-sheet"
            : "border-rule bg-sheet",
      )}
    >
      <span className="min-w-0">
        <span className="block truncate text-base font-medium text-ink">
          {r.name}
        </span>
        {r.studentCode ? (
          // 16px: this is the field the operator reads off a card while a
          // queue waits. At touch density it is primary content, not meta —
          // the comfortable-density 12px would be unreadable at arm's length.
          <Figure className="block text-base text-ink-2">
            {r.studentCode}
          </Figure>
        ) : null}
      </span>

      <span className="shrink-0">
        {done ? (
          // The seal — the system's one animation, for the one moment
          // something became permanent. Under prefers-reduced-motion it still
          // renders, it just does not animate: it carries state, not delight.
          <span className="seal-in inline-flex items-center gap-1.5 rounded-md bg-teal-soft px-2.5 py-1.5 text-base font-semibold text-teal">
            <Check className="size-4" aria-hidden />
            {t("shared.door.doorDone")}
          </span>
        ) : commit === "committing" ? (
          <span className="inline-flex items-center gap-2 px-2.5 py-1.5 text-base text-ink-2">
            <Spinner />
            {t("shared.door.committing")}
          </span>
        ) : commit === "failed" ? (
          <span className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-[15px] font-medium text-red">
              <AlertCircle className="size-4" aria-hidden />
              {t("shared.door.commitFailed")}
            </span>
            <Button
              size="lg"
              variant="outline"
              className="h-12 text-base"
              onClick={onConfirm}
            >
              {t("shared.door.retry")}
            </Button>
          </span>
        ) : atCounter ? (
          <Button size="lg" className="h-12 px-5 text-base" onClick={onConfirm}>
            {t("shared.door.confirm")}
          </Button>
        ) : (
          // Not at the counter yet: there is nothing to press, and a line
          // saying why. A disabled Confirm would read as "try again later"
          // when the actual answer is "this student has not arrived".
          <span className="flex max-w-[11rem] flex-col items-end gap-0.5 text-end">
            <span className="text-base font-medium text-ink-2">
              {t("shared.door.waiting")}
            </span>
            {/* LimitNote is 12px — right for `comfortable`, below this
                surface's 16px floor. Stated at touch size instead of bending
                a shared component for one caller. */}
            <span className="text-[15px] leading-snug text-ink-3">
              {t("shared.door.noCounterHint")}
            </span>
          </span>
        )}
      </span>
    </li>
  );
}
