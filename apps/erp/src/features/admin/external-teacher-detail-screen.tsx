"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { AlertTriangle, ArrowRightLeft, CheckCircle2, Plus, Users } from "lucide-react";
import { api } from "@/lib/api/client";
import { useFormatters } from "@/lib/i18n/use-formatters";
import { PageSpinner, Spinner } from "@/components/kit/spinner";
import { ConfirmDialog } from "@/components/kit/confirm-dialog";
import { Button } from "@repo/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/dialog";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import { toast } from "@repo/ui/components/sonner";
import { Badge, DataTable, DateText, EmptyState, Money, PageHead, RowIdentity, Sheet, SheetHead, type Column } from "./ledger";

/**
 * One off-system teacher: their students, their statement, and what is missing.
 *
 * Three things this screen is careful about:
 *
 *  1. THE DUPLICATE. Registering a student runs a lookup FIRST and reports
 *     "we already know this child" before anything is written, because a
 *     duplicated student is invisible once created and impossible to merge.
 *
 *  2. THE MONEY. The settle box says what is owed, and the number it settles
 *     against is the server's, never one this screen computed. The amount field
 *     is pre-filled with the full balance because that is what a center does at
 *     the end of a month; anything else is a deliberate act.
 *
 *  3. THE GAPS. The completeness findings sit on the same page as the teacher
 *     they concern, not on a separate report nobody opens.
 */

type Detail = {
  teacherId: string;
  name: string;
  email: string | null;
  phone: string | null;
  systemStatus: "external" | "enrolled";
  accountStatus: string;
  pendingClaim: boolean;
  subjects: string[];
  centerShare: number | null;
  walletBalance: number;
  removed: boolean;
  records: Record<string, number>;
  statusHistory: {
    id: string;
    fromStatus: string;
    toStatus: string;
    reason: string;
    createdAt: string;
  }[];
};

type StudentRow = {
  studentId: string;
  name: string;
  studentCode: string | null;
  phone: string | null;
  dataSource: "system" | "manual";
  groups: { courseId: string; title: string }[];
  alsoWithEnrolledTeacher: boolean;
  activeSubscriptions: number;
};

type Statement = {
  grossCollected: number;
  platformFees: number;
  centerShare: number;
  teacherEarned: number;
  alreadySettled: number;
  walletBalance: number;
  lessonsWithoutSplitRecord: number;
  sessionsSettled: number;
  lessonsAwaitingCompletion: number;
};

type Gap = {
  kind: string;
  severity: "blocking" | "warning";
  courseTitle: string;
  date: string | null;
  detail: Record<string, string | number | null>;
};

type Match = {
  found: boolean;
  studentId: string | null;
  onThisCenterRoster: boolean;
  name: string | null;
  matchedOn: string | null;
  existingGroups: { courseId: string; title: string }[];
};

export function ExternalTeacherDetailScreen({ teacherId }: { teacherId: string }) {
  const t = useTranslations();
  const { formatEGP, formatDate } = useFormatters();

  const [detail, setDetail] = useState<Detail | null>(null);
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [statement, setStatement] = useState<Statement | null>(null);
  const [gaps, setGaps] = useState<Gap[]>([]);
  const [busy, setBusy] = useState(false);

  // add-student dialog
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [form, setForm] = useState({
    fullName: "",
    phone: "",
    nationalId: "",
    guardianPhone: "",
    courseId: "",
  });
  const [match, setMatch] = useState<Match | null>(null);
  const [checking, setChecking] = useState(false);

  // settle dialog
  const [isSettleOpen, setIsSettleOpen] = useState(false);
  const [settleAmount, setSettleAmount] = useState("");
  const [settleNote, setSettleNote] = useState("");

  // convert dialog
  const [isConvertOpen, setIsConvertOpen] = useState(false);
  const [convertEmail, setConvertEmail] = useState("");
  const [convertReason, setConvertReason] = useState("");
  const [claimLink, setClaimLink] = useState<string | null>(null);

  const base = `center/external-teachers/${teacherId}`;

  const load = useCallback(async () => {
    const [d, s, st, g] = await Promise.all([
      api.get(base).json<{ data: Detail }>(),
      api.get(`${base}/students`).json<{ data: StudentRow[] }>(),
      api.get(`${base}/statement`).json<{ data: Statement }>().catch(() => null),
      api
        .get(`center/external-teachers/gaps?teacherId=${teacherId}`)
        .json<{ data: { gaps: Gap[] } }>()
        .catch(() => null),
    ]);
    setDetail(d.data);
    setStudents(s.data);
    setStatement(st?.data ?? null);
    setGaps(g?.data.gaps ?? []);
  }, [base, teacherId]);

  useEffect(() => {
    load().catch((e: Error) => toast.error(e.message));
  }, [load]);

  const groups = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of students) for (const g of s.groups) map.set(g.courseId, g.title);
    return [...map.entries()].map(([courseId, title]) => ({ courseId, title }));
  }, [students]);

  /** Run BEFORE the create, so the operator is told rather than surprised. */
  const runLookup = async () => {
    if (!form.phone && !form.nationalId) return;
    setChecking(true);
    try {
      const res = await api
        .post(`${base}/students/lookup`, {
          json: {
            phone: form.phone || null,
            nationalId: form.nationalId || null,
          },
        })
        .json<{ data: Match }>();
      setMatch(res.data);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setChecking(false);
    }
  };

  const addStudent = async () => {
    setBusy(true);
    try {
      const res = await api
        .post(`${base}/students`, {
          json: {
            fullName: form.fullName,
            phone: form.phone || null,
            nationalId: form.nationalId || null,
            guardianPhone: form.guardianPhone || null,
            courseId: form.courseId || null,
          },
        })
        .json<{ data: { created: boolean } }>();
      // Saying WHICH happened matters: silently reusing a record looks like the
      // save failed, and silently creating one hides the duplicate.
      toast.success(
        res.data.created
          ? t("externalTeachers.student_created")
          : t("externalTeachers.student_reused"),
      );
      setIsAddOpen(false);
      setForm({ fullName: "", phone: "", nationalId: "", guardianPhone: "", courseId: "" });
      setMatch(null);
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const settle = async () => {
    setBusy(true);
    try {
      const now = new Date();
      const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
      const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
      await api
        .post(`${base}/settlements`, {
          json: {
            amount: Math.round(Number(settleAmount) * 100),
            from: from.toISOString(),
            to: to.toISOString(),
            paymentMethod: "cash",
            note: settleNote || null,
            snapshot: statement
              ? {
                  grossCollected: statement.grossCollected,
                  centerShareTotal: statement.centerShare,
                  platformFeeTotal: statement.platformFees,
                  teacherAccrued: statement.teacherEarned,
                }
              : undefined,
          },
        })
        .json();
      toast.success(t("externalTeachers.settled"));
      setIsSettleOpen(false);
      setSettleAmount("");
      setSettleNote("");
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const convert = async () => {
    setBusy(true);
    try {
      const res = await api
        .post(`${base}/convert`, {
          json: { to: "enrolled", email: convertEmail || null, reason: convertReason },
        })
        .json<{ data: { invite: { link: string } | null } }>();
      setClaimLink(res.data.invite?.link ?? null);
      toast.success(t("externalTeachers.converted"));
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (!detail) return <PageSpinner />;

  const studentColumns: Column<StudentRow>[] = [
    {
      id: "student",
      header: t("roles.student"),
      cell: (r) => <RowIdentity name={r.name} meta={r.studentCode ?? r.phone ?? undefined} />,
    },
    {
      id: "groups",
      header: t("nav.classes"),
      cell: (r) => (
        <span className="text-[13px] text-[var(--ink-2)]">
          {r.groups.map((g) => g.title).join("، ") || "—"}
        </span>
      ),
    },
    {
      id: "shared",
      header: t("externalTeachers.shared"),
      cell: (r) =>
        // The shared child is the case a duplicated record would have hidden.
        // It is surfaced, not merely permitted.
        r.alsoWithEnrolledTeacher ? (
          <Badge tone="info">{t("externalTeachers.shared_yes")}</Badge>
        ) : (
          <span className="text-xs text-[var(--ink-3)]">—</span>
        ),
    },
    {
      id: "source",
      header: t("externalTeachers.source"),
      cell: (r) => (
        <Badge tone="neutral">
          {r.dataSource === "manual"
            ? t("externalTeachers.source_manual")
            : t("externalTeachers.source_system")}
        </Badge>
      ),
    },
    {
      id: "coverage",
      header: t("externalTeachers.coverage"),
      numeric: true,
      cell: (r) =>
        r.activeSubscriptions > 0 ? (
          <Badge tone="done">{t("externalTeachers.coverage_paid")}</Badge>
        ) : (
          <Badge tone="pending">{t("externalTeachers.coverage_unpaid")}</Badge>
        ),
    },
  ];

  return (
    <div className="flex flex-col gap-5">
      <PageHead
        title={detail.name}
        subtitle={detail.subjects.join("، ") || undefined}
        actions={
          <div className="flex items-center gap-2">
            {detail.systemStatus === "external" ? (
              <Button variant="outline" onClick={() => setIsConvertOpen(true)}>
                <ArrowRightLeft className="size-4" />
                {t("externalTeachers.convert")}
              </Button>
            ) : null}
            <Button onClick={() => setIsAddOpen(true)}>
              <Plus className="size-4" />
              {t("externalTeachers.addStudent")}
            </Button>
          </div>
        }
      />

      {/* ---- statement ---- */}
      {statement ? (
        <Sheet>
          <SheetHead
            title={t("externalTeachers.statement")}
            action={
              statement.walletBalance > 0 ? (
                <Button
                  size="sm"
                  onClick={() => {
                    setSettleAmount((statement.walletBalance / 100).toFixed(2));
                    setIsSettleOpen(true);
                  }}
                >
                  {t("externalTeachers.settle")}
                </Button>
              ) : (
                <span className="flex items-center gap-1 text-[13px] text-[var(--teal)]">
                  <CheckCircle2 className="size-4" />
                  {t("externalTeachers.settled_clear")}
                </span>
              )
            }
          />
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 p-4 sm:grid-cols-4">
            <Figure label={t("externalTeachers.collected")} value={formatEGP(statement.grossCollected)} />
            <Figure label={t("externalTeachers.centerCut")} value={formatEGP(statement.centerShare)} />
            <Figure label={t("externalTeachers.platformFees")} value={formatEGP(statement.platformFees)} />
            <Figure
              label={t("externalTeachers.owed")}
              value={formatEGP(statement.walletBalance)}
              emphasis
            />
          </dl>
          {statement.lessonsAwaitingCompletion > 0 ? (
            // The single most common reason a teacher is under-paid, said out
            // loud instead of leaving the number unexplained.
            <p className="flex items-center gap-2 border-t border-[var(--rule)] px-4 py-3 text-[13px] text-[var(--ink-2)]">
              <AlertTriangle className="size-4 text-[var(--amber)]" />
              {t("externalTeachers.awaitingCompletion", {
                count: statement.lessonsAwaitingCompletion,
              })}
            </p>
          ) : null}
          {statement.lessonsWithoutSplitRecord > 0 ? (
            <p className="border-t border-[var(--rule)] px-4 py-3 text-xs text-[var(--ink-3)]">
              {t("externalTeachers.legacySplitNote", {
                count: statement.lessonsWithoutSplitRecord,
              })}
            </p>
          ) : null}
        </Sheet>
      ) : null}

      {/* ---- gaps ---- */}
      {gaps.length > 0 ? (
        <Sheet blocking={gaps.some((g) => g.severity === "blocking")}>
          <SheetHead title={t("externalTeachers.gaps_title")} />
          <ul className="flex flex-col divide-y divide-[var(--rule)]">
            {gaps.slice(0, 12).map((g, i) => (
              <li key={i} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <span className="text-[13px] text-[var(--ink)]">
                  {t(`externalTeachers.gap_${g.kind}` as never)}
                  <span className="text-[var(--ink-3)]"> — {g.courseTitle}</span>
                </span>
                <span className="flex items-center gap-2">
                  {g.date ? (
                    <DateText className="text-xs text-[var(--ink-3)]">{formatDate(g.date)}</DateText>
                  ) : null}
                  <Badge tone={g.severity === "blocking" ? "failed" : "pending"}>
                    {g.severity === "blocking"
                      ? t("externalTeachers.gap_blocking")
                      : t("externalTeachers.gap_warning")}
                  </Badge>
                </span>
              </li>
            ))}
          </ul>
        </Sheet>
      ) : null}

      {/* ---- students ---- */}
      <DataTable
        columns={studentColumns}
        rows={students}
        rowKey={(r) => r.studentId}
        caption={t("nav.students")}
        empty={
          <EmptyState
            icon={<Users className="size-6" />}
            title={t("externalTeachers.students_empty")}
            hint={t("externalTeachers.students_emptyHint")}
            action={
              <Button onClick={() => setIsAddOpen(true)}>{t("externalTeachers.addStudent")}</Button>
            }
          />
        }
      />

      {/* ---- conversion history ---- */}
      {detail.statusHistory.length > 0 ? (
        <Sheet>
          <SheetHead title={t("externalTeachers.history")} />
          <ul className="flex flex-col divide-y divide-[var(--rule)]">
            {detail.statusHistory.map((h) => (
              <li key={h.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <span className="text-[13px] text-[var(--ink)]">
                  {t("externalTeachers.history_line", {
                    from: t(`externalTeachers.status_${h.fromStatus}` as never),
                    to: t(`externalTeachers.status_${h.toStatus}` as never),
                  })}
                  <span className="text-[var(--ink-3)]"> — {h.reason}</span>
                </span>
                <DateText className="text-xs text-[var(--ink-3)]">{formatDate(h.createdAt)}</DateText>
              </li>
            ))}
          </ul>
        </Sheet>
      ) : null}

      {/* ================= dialogs ================= */}

      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("externalTeachers.addStudent")}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <Field
              label={t("externalTeachers.form_studentName")}
              value={form.fullName}
              onChange={(v) => setForm((f) => ({ ...f, fullName: v }))}
            />
            <Field
              label={t("externalTeachers.form_phone")}
              value={form.phone}
              ltr
              onChange={(v) => setForm((f) => ({ ...f, phone: v }))}
              onBlur={runLookup}
            />
            <Field
              label={t("externalTeachers.form_nationalId")}
              value={form.nationalId}
              ltr
              onChange={(v) => setForm((f) => ({ ...f, nationalId: v }))}
              onBlur={runLookup}
              hint={t("externalTeachers.form_nationalIdHint")}
            />
            <Field
              label={t("externalTeachers.form_guardianPhone")}
              value={form.guardianPhone}
              ltr
              onChange={(v) => setForm((f) => ({ ...f, guardianPhone: v }))}
            />
            {groups.length > 0 ? (
              <div className="flex flex-col gap-1.5">
                <Label>{t("externalTeachers.form_group")}</Label>
                <select
                  className="h-9 rounded-md border border-[var(--rule)] bg-transparent px-2 text-[13px]"
                  value={form.courseId}
                  onChange={(e) => setForm((f) => ({ ...f, courseId: e.target.value }))}
                >
                  <option value="">—</option>
                  {groups.map((g) => (
                    <option key={g.courseId} value={g.courseId}>
                      {g.title}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

            {checking ? <Spinner /> : null}
            {match?.found ? (
              <div className="rounded-md border border-[var(--rule)] bg-[var(--indigo-soft)] p-3 text-[13px] text-[var(--ink)]">
                <p className="font-semibold">{t("externalTeachers.match_title")}</p>
                <p className="mt-1 text-[var(--ink-2)]">
                  {match.onThisCenterRoster
                    ? t("externalTeachers.match_onRoster", { name: match.name ?? "" })
                    : t("externalTeachers.match_elsewhere", { name: match.name ?? "" })}
                </p>
                {match.existingGroups.length > 0 ? (
                  <p className="mt-1 text-xs text-[var(--ink-3)]">
                    {match.existingGroups.map((g) => g.title).join("، ")}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddOpen(false)}>
              {t("actions.cancel")}
            </Button>
            <Button onClick={addStudent} disabled={busy || form.fullName.trim().length < 2}>
              {busy ? <Spinner /> : null}
              {t("actions.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isSettleOpen} onOpenChange={setIsSettleOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("externalTeachers.settle")}</DialogTitle>
          </DialogHeader>
          <p className="text-[13px] text-[var(--ink-2)]">
            {t("externalTeachers.settle_hint", {
              amount: formatEGP(statement?.walletBalance ?? 0),
            })}
          </p>
          <Field
            label={t("externalTeachers.settle_amount")}
            value={settleAmount}
            ltr
            onChange={setSettleAmount}
          />
          <Field
            label={t("externalTeachers.settle_note")}
            value={settleNote}
            onChange={setSettleNote}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsSettleOpen(false)}>
              {t("actions.cancel")}
            </Button>
            {/* Money leaving the center confirms — the same discipline every
                other money-out action in this portal uses. */}
            <ConfirmDialog
              trigger={<Button disabled={busy || !settleAmount}>{t("externalTeachers.settle")}</Button>}
              title={t("externalTeachers.settle_confirmTitle")}
              confirmText={t("externalTeachers.settle")}
              cancelText={t("actions.cancel")}
              onConfirm={settle}
            />
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isConvertOpen} onOpenChange={setIsConvertOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("externalTeachers.convert")}</DialogTitle>
          </DialogHeader>
          {claimLink ? (
            <div className="flex flex-col gap-2">
              <p className="text-[13px] text-[var(--ink-2)]">
                {t("externalTeachers.convert_done")}
              </p>
              {/* The link is shown because an invite in a spam folder must not
                  strand a teacher who already agreed to join. */}
              <Input dir="ltr" className="num" readOnly value={claimLink} />
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <p className="text-[13px] leading-relaxed text-[var(--ink-2)]">
                {t("externalTeachers.convert_hint", {
                  records: Object.values(detail.records).reduce((a, b) => a + b, 0),
                })}
              </p>
              <Field
                label={t("externalTeachers.form_email")}
                value={convertEmail || detail.email || ""}
                ltr
                onChange={setConvertEmail}
                hint={t("externalTeachers.convert_emailHint")}
              />
              <Field
                label={t("externalTeachers.convert_reason")}
                value={convertReason}
                onChange={setConvertReason}
              />
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsConvertOpen(false);
                setClaimLink(null);
              }}
            >
              {claimLink ? t("actions.dismiss") : t("actions.cancel")}
            </Button>
            {claimLink ? null : (
              <Button onClick={convert} disabled={busy || convertReason.trim().length < 3}>
                {busy ? <Spinner /> : null}
                {t("externalTeachers.convert")}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Figure({
  label,
  value,
  emphasis,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-xs text-[var(--ink-3)]">{label}</dt>
      <dd className="m-0">
        <Money tone={emphasis ? "net" : "neutral"}>{value}</Money>
      </dd>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  onBlur,
  ltr,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  ltr?: boolean;
  hint?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label>{label}</Label>
      <Input
        value={value}
        dir={ltr ? "ltr" : undefined}
        className={ltr ? "num" : undefined}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
      />
      {hint ? <p className="text-xs text-[var(--ink-3)]">{hint}</p> : null}
    </div>
  );
}
