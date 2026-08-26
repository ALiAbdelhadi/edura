/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { PageSpinner } from "@/components/kit/spinner";
import CopyableText from "@/components/ui/copyable-text";
import { useFormatters } from "@/lib/i18n/use-formatters";
import { useCustomMutation, useList } from "@refinedev/core";
import { Button } from "@repo/ui/components/button";
import { toast } from "@repo/ui/components/sonner";
import { Textarea } from "@repo/ui/components/textarea";
import { Check, Inbox, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { Badge, ClearanceNotice, DataTable, DateText, EmptyState, Eyebrow, PageHead, RowIdentity, Sheet, TwoStepCommit, type Column } from "./ledger";

type PopulatedRef = { _id?: string; id?: string; name?: string; title?: string };

interface EnrollmentRequest {
  _id: string;
  studentId: string | PopulatedRef;
  courseId: string | PopulatedRef;
  centerId: string;
  status: string;
  submittedAt: string;
}

function refId(v: string | PopulatedRef | undefined | null): string {
  if (!v) return "";
  if (typeof v === "string") return v;
  return v._id ?? v.id ?? "";
}

function refLabel(v: string | PopulatedRef | undefined | null, field: "name" | "title"): string | undefined {
  if (!v || typeof v === "string") return undefined;
  return v[field];
}

function daysWaiting(iso: string): number {
  const ms = Date.now() - new Date(iso).getTime();
  return Math.max(0, Math.floor(ms / 86_400_000));
}

export function AdminEnrollmentRequestsScreen() {
  const t = useTranslations();
  const { formatDate } = useFormatters();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [declineOpen, setDeclineOpen] = useState(false);
  const [declineReason, setDeclineReason] = useState("");

  const { query: requestsQuery, result: requestsResult } = useList<EnrollmentRequest>({
    resource: "enrollment-requests",
    filters: [{ field: "status", operator: "eq", value: "pending" }],
    pagination: { mode: "off" },
  });
  const requests = (requestsResult?.data ?? []) as EnrollmentRequest[];

  const { result: studentsResult } = useList({ resource: "students", pagination: { mode: "off" } });
  const { result: coursesResult } = useList({ resource: "courses", pagination: { mode: "off" } });

  const studentMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of (studentsResult?.data ?? []) as any[]) {
      m.set(String(s.studentId || s.id || s._id), s.name);
    }
    return m;
  }, [studentsResult]);

  const courseMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of (coursesResult?.data ?? []) as any[]) {
      m.set(c._id, c.title);
    }
    return m;
  }, [coursesResult]);

  const { mutateAsync: approveMut } = useCustomMutation();
  const { mutateAsync: declineMut, mutation: declineMutation } = useCustomMutation();

  const selected = requests.find((r) => r._id === selectedId) ?? null;

  const nameOf = (r: EnrollmentRequest) => {
    const id = refId(r.studentId);
    return refLabel(r.studentId, "name") ?? studentMap.get(id) ?? id;
  };
  const courseOf = (r: EnrollmentRequest) =>
    refLabel(r.courseId, "title") ?? courseMap.get(refId(r.courseId)) ?? refId(r.courseId);

  const handleApprove = async (id: string) => {
    try {
      await approveMut({ url: `enrollment-requests/${id}/approve`, method: "post", values: {} });
      toast.success(t("adminManage.enroll.requestApproved"));
      setSelectedId(null);
      requestsQuery.refetch();
    } catch (err: any) {
      const msg = err?.response?.data?.error?.message || err?.message || t("adminManage.enroll.approveFailed");
      if (msg.toLowerCase().includes("already enrolled")) {
        toast.warning(t("adminManage.enroll.alreadyEnrolled"));
      } else {
        toast.error(msg);
      }
      requestsQuery.refetch();
    }
  };

  const handleDecline = async () => {
    if (!selectedId || !declineReason.trim()) return;
    try {
      await declineMut({
        url: `enrollment-requests/${selectedId}/decline`,
        method: "post",
        values: { reason: declineReason },
      });
      toast.success(t("adminManage.enroll.requestDeclined"));
      setSelectedId(null);
      setDeclineOpen(false);
      setDeclineReason("");
      requestsQuery.refetch();
    } catch {
      toast.error(t("adminManage.enroll.declineFailed"));
    }
  };

  if (requestsQuery.isLoading) {
    return <PageSpinner label={t("adminManage.enroll.loadingRequests")} />;
  }

  const columns: Column<EnrollmentRequest>[] = [
    {
      id: "student",
      header: t("adminManage.enroll.colStudent"),
      cell: (r) => <RowIdentity name={nameOf(r)} meta={refId(r.studentId)} />,
    },
    {
      id: "course",
      header: t("adminManage.enroll.colCourse"),
      cell: (r) => <span className="text-[13px] text-(--ink)">{courseOf(r)}</span>,
    },
    {
      id: "submitted",
      header: t("adminManage.enroll.colSubmitted"),
      cell: (r) => (
        <DateText className="text-xs text-(--ink-3)">
          {formatDate(r.submittedAt, { day: "numeric", month: "short", year: "numeric" })}
        </DateText>
      ),
    },
    {
      id: "status",
      header: t("adminManage.enroll.colStatus"),
      numeric: true,
      cell: (r) => (
        <Badge tone="pending" age={t("adminManage.enroll.waitingAge", { n: daysWaiting(r.submittedAt) })}>
          {t("status.pending")}
        </Badge>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-5">
      <PageHead
        title={t("adminManage.enroll.title")}
        subtitle={t("adminManage.enroll.subtitle")}
      />
      {requests.length === 0 ? (
        <Sheet>
          <EmptyState icon={<Inbox className="size-6" />} title={t("adminManage.enroll.noPending")} />
        </Sheet>
      ) : (
        <div className="grid gap-4 xl:grid-cols-[1fr_396px]">
          <DataTable
            columns={columns}
            rows={requests}
            rowKey={(r) => r._id}
            onRowClick={(r) => {
              setSelectedId(r._id);
              setDeclineOpen(false);
              setDeclineReason("");
            }}
            selectedKey={selectedId}
            caption={t("adminManage.enroll.title")}
          />
          <Sheet className="h-fit p-4">
            {!selected ? (
              <EmptyState
                title={t("adminManage.enroll.selectPrompt")}
                hint={t("adminManage.enroll.selectHint")}
              />
            ) : (
              <div className="flex flex-col gap-3.5">
                <div>
                  <Eyebrow>{t("adminManage.enroll.panelEyebrow")}</Eyebrow>
                  <h2 className="mt-1.5 mb-0 text-[17px] font-bold text-(--ink)">
                    {nameOf(selected)}
                  </h2>
                  <p className="mt-0.5 mb-0 text-[13px] text-(--ink-2)">{courseOf(selected)}</p>
                </div>
                <div className="lg-field flex flex-col gap-2 p-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-xs text-(--ink-2)">
                      {t("adminManage.enroll.requestedOn")}
                    </span>
                    <DateText className="text-[13px] text-(--ink)">
                      {formatDate(selected.submittedAt, {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </DateText>
                  </div>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-xs text-(--ink-2)">
                      {t("adminManage.enroll.studentIdLabel")}
                    </span>
                    <CopyableText
                      value={refId(selected.studentId)}
                      label={t("adminManage.enroll.userId")}
                    />
                  </div>
                </div>
                <ClearanceNotice>{t("adminManage.enroll.clearance")}</ClearanceNotice>
                <TwoStepCommit
                  resetKey={selected._id}
                  icon={<Check className="size-4" />}
                  label={t("adminManage.enroll.approveCommit")}
                  armedLabel={t("adminManage.enroll.approveArmed")}
                  hint={t("adminManage.enroll.approveHint")}
                  armedHint={t("adminManage.enroll.approveArmedHint")}
                  onCommit={() => handleApprove(selected._id)}
                />
                {declineOpen ? (
                  <div className="flex flex-col gap-2">
                    <Textarea
                      rows={3}
                      autoFocus
                      placeholder={t("adminManage.enroll.declineReasonPlaceholder")}
                      value={declineReason}
                      onChange={(e) => setDeclineReason(e.target.value)}
                    />
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        className="flex-1 border-destructive text-destructive"
                        disabled={!declineReason.trim() || declineMutation.isPending}
                        onClick={handleDecline}
                      >
                        {t("adminManage.enroll.declineSubmit")}
                      </Button>
                      <Button type="button" variant="ghost" onClick={() => setDeclineOpen(false)}>
                        {t("actions.cancel")}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    className="border-(--rule) text-destructive"
                    onClick={() => setDeclineOpen(true)}
                  >
                    <X className="size-4" />
                    {t("adminManage.enroll.declineOpen")}
                  </Button>
                )}
              </div>
            )}
          </Sheet>
        </div>
      )}
    </div>
  );
}
