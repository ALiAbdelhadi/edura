"use client";

import React, { useState } from "react";
import { useCustom, useApiUrl, useInvalidate } from "@refinedev/core";
import {
  Card,
  Table,
  Tag,
  Button,
  Space,
  Typography,
  Modal,
  Input,
  App,
  Segmented,
} from "antd";
import { CheckOutlined, CloseOutlined, BankOutlined, UserOutlined } from "@ant-design/icons";
import { useI18n } from "@/components/providers/I18nProvider";
import { TableSkeleton } from "@/components/shared/Skeletons";
import { EmptyState } from "@/components/shared/EmptyState";

type CenterRow = { id: string; name: string; status: string; createdAt: string; admins: { name: string; email: string | null }[] };
type TeacherRow = { id: string; name: string; email: string | null; status: string; createdAt: string };

export function RegistrationsQueue() {
  const { t, formatDate } = useI18n();
  const { message } = App.useApp();
  const apiUrl = useApiUrl();
  const invalidate = useInvalidate();
  const [status, setStatus] = useState<"pending" | "active" | "rejected">("pending");
  const [busy, setBusy] = useState<string | null>(null);

  const { query, result } = useCustom<{ centers: CenterRow[]; teachers: TeacherRow[] }>({
    url: "admin/registrations",
    method: "get",
    config: { query: { status } },
  });

  const centers = result?.data?.centers ?? [];
  const teachers = result?.data?.teachers ?? [];

  const refresh = () => query.refetch();

  async function act(kind: "centers" | "teachers", id: string, decision: "approve" | "reject") {
    const run = async (reason?: string) => {
      setBusy(id);
      try {
        const res = await fetch(`${apiUrl}/admin/${kind}/${id}/${decision}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(decision === "reject" ? { reason } : {}),
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j?.error?.message || "Request failed");
        }
        message.success(decision === "approve" ? "Approved" : "Rejected");
        refresh();
        invalidate({ resource: "notifications", invalidates: ["list"] });
      } catch (e) {
        message.error(e instanceof Error ? e.message : "Failed");
      } finally {
        setBusy(null);
      }
    };

    if (decision === "approve") {
      Modal.confirm({
        title: t("actions.confirm") === "actions.confirm" ? "Confirm approval" : t("actions.confirm"),
        content: "This will activate the account and notify the owner.",
        okText: t("actions.approve") === "actions.approve" ? "Approve" : t("actions.approve"),
        onOk: () => run(),
      });
    } else {
      let reason = "";
      Modal.confirm({
        title: t("actions.reject") === "actions.reject" ? "Reject registration" : t("actions.reject"),
        content: (
          <div style={{ marginTop: 8 }}>
            <Typography.Paragraph type="secondary" style={{ marginBottom: 8 }}>
              A reason is required — it is emailed to the applicant.
            </Typography.Paragraph>
            <Input.TextArea
              rows={3}
              aria-label="Rejection reason"
              onChange={(e) => (reason = e.target.value)}
              placeholder="Reason"
            />
          </div>
        ),
        okText: t("actions.reject") === "actions.reject" ? "Reject" : t("actions.reject"),
        okButtonProps: { danger: true },
        onOk: () => {
          if (!reason.trim()) {
            message.error("Reason is required");
            return Promise.reject();
          }
          return run(reason);
        },
      });
    }
  }

  const statusTag = (s: string) => {
    const color = s === "active" ? "success" : s === "rejected" ? "error" : "warning";
    const label = t("status." + s) === "status." + s ? s : t("status." + s);
    return <Tag color={color}>{label}</Tag>;
  };

  const centerCols = [
    {
      title: t("nav.centers"),
      dataIndex: "name",
      render: (name: string, r: CenterRow) => (
        <Space>
          <BankOutlined aria-hidden style={{ color: "#0284c7" }} />
          <div>
            <Typography.Text strong>{name}</Typography.Text>
            <br />
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {r.admins[0]?.email ?? "—"}
            </Typography.Text>
          </div>
        </Space>
      ),
    },
    { title: t("status.pending") === "status.pending" ? "Status" : "", dataIndex: "status", render: statusTag, width: 120 },
    { title: "", dataIndex: "createdAt", render: (d: string) => <Typography.Text type="secondary">{formatDate(d)}</Typography.Text>, width: 130 },
    {
      title: "",
      key: "actions",
      width: 180,
      render: (_: unknown, r: CenterRow) =>
        r.status === "pending" ? (
          <Space>
            <Button size="small" type="primary" icon={<CheckOutlined />} loading={busy === r.id} onClick={() => act("centers", r.id, "approve")}>
              {t("actions.approve") === "actions.approve" ? "Approve" : t("actions.approve")}
            </Button>
            <Button size="small" danger icon={<CloseOutlined />} disabled={busy === r.id} onClick={() => act("centers", r.id, "reject")}>
              {t("actions.reject") === "actions.reject" ? "Reject" : t("actions.reject")}
            </Button>
          </Space>
        ) : null,
    },
  ];

  const teacherCols = [
    {
      title: t("nav.teachers"),
      dataIndex: "name",
      render: (name: string, r: TeacherRow) => (
        <Space>
          <UserOutlined aria-hidden style={{ color: "#7c3aed" }} />
          <div>
            <Typography.Text strong>{name}</Typography.Text>
            <br />
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>{r.email ?? "—"}</Typography.Text>
          </div>
        </Space>
      ),
    },
    { title: "", dataIndex: "status", render: statusTag, width: 120 },
    { title: "", dataIndex: "createdAt", render: (d: string) => <Typography.Text type="secondary">{formatDate(d)}</Typography.Text>, width: 130 },
    {
      title: "",
      key: "actions",
      width: 180,
      render: (_: unknown, r: TeacherRow) =>
        r.status === "pending" ? (
          <Space>
            <Button size="small" type="primary" icon={<CheckOutlined />} loading={busy === r.id} onClick={() => act("teachers", r.id, "approve")}>
              {t("actions.approve") === "actions.approve" ? "Approve" : t("actions.approve")}
            </Button>
            <Button size="small" danger icon={<CloseOutlined />} disabled={busy === r.id} onClick={() => act("teachers", r.id, "reject")}>
              {t("actions.reject") === "actions.reject" ? "Reject" : t("actions.reject")}
            </Button>
          </Space>
        ) : null,
    },
  ];

  return (
    <Space direction="vertical" size="large" style={{ width: "100%" }}>
      <Segmented
        value={status}
        onChange={(v) => setStatus(v as typeof status)}
        options={[
          { value: "pending", label: t("status.pending") === "status.pending" ? "Pending" : t("status.pending") },
          { value: "active", label: t("status.active") === "status.active" ? "Active" : t("status.active") },
          { value: "rejected", label: t("status.rejected") === "status.rejected" ? "Rejected" : t("status.rejected") },
        ]}
      />

      <Card title={t("nav.centers")} styles={{ body: { padding: centers.length ? 0 : 24 } }}>
        {query.isLoading ? (
          <TableSkeleton rows={4} columns={4} />
        ) : centers.length === 0 ? (
          <EmptyState
            variant={status === "pending" ? "no-results" : "first-run"}
            title={status === "pending" ? "No pending centers" : "No centers"}
            description={status === "pending" ? "New center registrations will appear here for review." : undefined}
          />
        ) : (
          <Table rowKey="id" dataSource={centers} columns={centerCols} pagination={false} scroll={{ x: "max-content" }} />
        )}
      </Card>

      <Card title={t("nav.teachers")} styles={{ body: { padding: teachers.length ? 0 : 24 } }}>
        {query.isLoading ? (
          <TableSkeleton rows={3} columns={4} />
        ) : teachers.length === 0 ? (
          <EmptyState variant="no-results" title="No teachers in this status" />
        ) : (
          <Table rowKey="id" dataSource={teachers} columns={teacherCols} pagination={false} scroll={{ x: "max-content" }} />
        )}
      </Card>
    </Space>
  );
}
