"use client";

import React, { useState, useMemo } from "react";
import { useList, useCustomMutation } from "@refinedev/core";
import { Card, Button, Space, Tag, Modal, Input, message } from "antd";
import { CheckOutlined, CloseOutlined } from "@ant-design/icons";
import CopyableText from "@/components/shared/CopyableText";
import StudentLink from "@/components/shared/StudentLink";
import { useI18n } from "@/components/providers/I18nProvider";

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
  const { t, formatDate } = useI18n();
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
      message.success(t("adminManage.enroll.requestApproved"));
      requestsQuery.refetch();
    } catch (err: any) {
      const msg = err?.response?.data?.error?.message || err?.message || t("adminManage.enroll.approveFailed");
      if (msg.toLowerCase().includes("already enrolled")) {
        message.warning(t("adminManage.enroll.alreadyEnrolled"));
      } else {
        message.error(msg);
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
      message.success(t("adminManage.enroll.requestDeclined"));
      setDeclineId(null);
      setDeclineReason("");
      requestsQuery.refetch();
    } catch {
      message.error(t("adminManage.enroll.declineFailed"));
    }
  };

  if (requestsQuery.isLoading) {
    return (
      <div style={{ textAlign: "center", padding: 40, color: "#888" }}>
        {t("adminManage.enroll.loadingRequests")}
      </div>
    );
  }

  return (
    <Space direction="vertical" size="middle" style={{ width: "100%" }}>
      <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>
        {t("adminManage.enroll.title")}{requests.length > 0 ? ` (${requests.length})` : ""}
      </h3>

      {requests.length === 0 ? (
        <Card style={{ textAlign: "center", padding: 40, color: "#999" }}>
          {t("adminManage.enroll.noPending")}
        </Card>
      ) : (
        requests.map((r) => {
          const studentId = refId(r.studentId);
          const studentName = refLabel(r.studentId, "name") ?? studentMap.get(studentId) ?? studentId;
          return (
          <Card key={r._id} size="small">
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
                gap: 12,
              }}
            >
              <div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>
                  <StudentLink studentId={studentId} name={studentName} />
                </div>
                <div style={{ marginTop: 4 }}>
                  <CopyableText value={studentId} label={t("adminManage.enroll.userId")} />
                </div>
                <div style={{ fontSize: 13, color: "#666" }}>
                  {refLabel(r.courseId, "title") ?? courseMap.get(refId(r.courseId)) ?? refId(r.courseId)}
                </div>
                <div style={{ fontSize: 12, color: "#999", marginTop: 4 }}>
                  {t("adminManage.enroll.submitted")}{" "}
                  {formatDate(r.submittedAt, {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </div>
              </div>
              <Space>
                <Tag color="orange">{t("status.pending")}</Tag>
                <Button
                  type="primary"
                  size="small"
                  icon={<CheckOutlined />}
                  loading={approveMutation.isPending}
                  onClick={() => handleApprove(r._id)}
                >
                  {t("actions.approve")}
                </Button>
                <Button
                  size="small"
                  danger
                  icon={<CloseOutlined />}
                  onClick={() => {
                    setDeclineId(r._id);
                    setDeclineReason("");
                  }}
                >
                  {t("adminManage.enroll.decline")}
                </Button>
              </Space>
            </div>
          </Card>
        );
        })
      )}

      <Modal
        title={t("adminManage.enroll.declineRequest")}
        open={!!declineId}
        onCancel={() => setDeclineId(null)}
        onOk={handleDecline}
        okText={t("adminManage.enroll.decline")}
        okButtonProps={{ danger: true, disabled: !declineReason.trim(), loading: declineMutation.isPending }}
      >
        <p style={{ marginBottom: 12, color: "#666" }}>
          {t("adminManage.enroll.declineReasonPrompt")}
        </p>
        <Input.TextArea
          rows={3}
          placeholder={t("adminManage.enroll.declineReasonPlaceholder")}
          value={declineReason}
          onChange={(e) => setDeclineReason(e.target.value)}
        />
      </Modal>
    </Space>
  );
}
