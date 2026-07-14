"use client";

import { useState, useMemo } from "react";
import { useList, useCustomMutation } from "@refinedev/core";
import { Check, X, Inbox } from "lucide-react";
import { useTranslations } from "next-intl";
import { Card, CardContent } from "@repo/ui/components/card";
import { Button } from "@repo/ui/components/button";
import { Textarea } from "@repo/ui/components/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@repo/ui/components/dialog";
import { toast } from "@repo/ui/components/sonner";
import { StatusBadge } from "@/components/kit/status-badge";
import { EmptyState } from "@/components/kit/empty-state";
import { PageHeader } from "@/components/kit/page-header";
import { PageSpinner, Spinner } from "@/components/kit/spinner";
import CopyableText from "@/components/ui/copyable-text";
import StudentLink from "@/components/ui/student-link";
import { useFormatters } from "@/lib/i18n/use-formatters";
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

export function AdminEnrollmentRequestsScreen() {
  const t = useTranslations();
  const { formatDate } = useFormatters();
  const [declineId, setDeclineId] = useState<string | null>(null);
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

  const { mutateAsync: approveMut, mutation: approveMutation } = useCustomMutation();
  const { mutateAsync: declineMut, mutation: declineMutation } = useCustomMutation();

  const handleApprove = async (id: string) => {
    try {
      await approveMut({ url: `enrollment-requests/${id}/approve`, method: "post", values: {} });
      toast.success(t("adminManage.enroll.requestApproved"));
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
    if (!declineId || !declineReason.trim()) return;
    try {
      await declineMut({
        url: `enrollment-requests/${declineId}/decline`,
        method: "post",
        values: { reason: declineReason },
      });
      toast.success(t("adminManage.enroll.requestDeclined"));
      setDeclineId(null);
      setDeclineReason("");
      requestsQuery.refetch();
    } catch {
      toast.error(t("adminManage.enroll.declineFailed"));
    }
  };

  if (requestsQuery.isLoading) {
    return <PageSpinner label={t("adminManage.enroll.loadingRequests")} />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={
          <>
            {t("adminManage.enroll.title")}
            {requests.length > 0 ? <span dir="ltr"> ({requests.length})</span> : null}
          </>
        }
      />

      <div className="flex flex-col gap-4">
        {requests.length === 0 ? (
          <EmptyState icon={Inbox} title={t("adminManage.enroll.noPending")} />
        ) : (
          requests.map((r) => {
            const studentId = refId(r.studentId);
            const studentName = refLabel(r.studentId, "name") ?? studentMap.get(studentId) ?? studentId;
            return (
              <Card key={r._id} className="py-4">
                <CardContent className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold">
                      <StudentLink studentId={studentId} name={studentName} />
                    </div>
                    <div className="mt-1">
                      <CopyableText value={studentId} label={t("adminManage.enroll.userId")} />
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {refLabel(r.courseId, "title") ?? courseMap.get(refId(r.courseId)) ?? refId(r.courseId)}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {t("adminManage.enroll.submitted")}{" "}
                      {formatDate(r.submittedAt, {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge tone="warning">{t("status.pending")}</StatusBadge>
                    <Button
                      size="sm"
                      disabled={approveMutation.isPending}
                      onClick={() => handleApprove(r._id)}
                    >
                      {approveMutation.isPending ? <Spinner /> : <Check className="size-4" />}
                      {t("actions.approve")}
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => {
                        setDeclineId(r._id);
                        setDeclineReason("");
                      }}
                    >
                      <X className="size-4" />
                      {t("adminManage.enroll.decline")}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      <Dialog
        open={!!declineId}
        onOpenChange={(open) => {
          if (!open) setDeclineId(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("adminManage.enroll.declineRequest")}</DialogTitle>
            <DialogDescription>
              {t("adminManage.enroll.declineReasonPrompt")}
            </DialogDescription>
          </DialogHeader>
          <Textarea
            rows={3}
            placeholder={t("adminManage.enroll.declineReasonPlaceholder")}
            value={declineReason}
            onChange={(e) => setDeclineReason(e.target.value)}
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDeclineId(null)}>
              {t("actions.cancel")}
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={!declineReason.trim() || declineMutation.isPending}
              onClick={handleDecline}
            >
              {declineMutation.isPending ? <Spinner /> : null}
              {t("adminManage.enroll.decline")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
