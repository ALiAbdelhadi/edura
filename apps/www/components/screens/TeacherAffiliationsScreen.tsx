"use client";

import React from "react";
import { useCustom, useCustomMutation, useInvalidate } from "@refinedev/core";
import { Card, Table, Tag, Button, Space, Popconfirm, message as antMessage, Empty } from "antd";
import { CheckOutlined, CloseOutlined, BankOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { useI18n } from "@/components/providers/I18nProvider";

type Affiliation = {
  _id?: string;
  id?: string;
  status: "pending" | "active" | "declined" | "expired" | "removed";
  expiresAt?: string;
  invitedAt?: string;
  respondedAt?: string;
  center?: { name: string; shortId?: string };
};

const statusColor: Record<Affiliation["status"], string> = {
  pending: "blue",
  active: "green",
  declined: "default",
  expired: "default",
  removed: "default",
};

export function TeacherAffiliationsScreen() {
  const { t, formatDate } = useI18n();
  const { query, result } = useCustom<Affiliation[]>({ url: "me/affiliations", method: "get" });
  const { mutate, mutation } = useCustomMutation();
  const invalidate = useInvalidate();

  const affiliations: Affiliation[] = Array.isArray(result?.data)
    ? (result.data as Affiliation[])
    : [];

  const statusLabel = (s: Affiliation["status"]): string => {
    if (s === "pending") return t("status.pending");
    if (s === "active") return t("status.active");
    if (s === "declined") return t("teacher.statusDeclined");
    if (s === "expired") return t("teacher.statusExpired");
    return t("teacher.statusRemoved");
  };

  const handleAction = (id: string, action: "accept" | "decline") => {
    mutate(
      { url: `affiliations/${id}/${action}`, method: "post", values: {} },
      {
        onSuccess: () => {
          antMessage.success(action === "accept" ? t("teacher.invitationAccepted") : t("teacher.invitationDeclined"));
          invalidate({ resource: "me-affiliations", invalidates: ["all"] });
          query.refetch?.();
        },
        onError: (err) => antMessage.error((err as { message?: string })?.message || t("teacher.actionFailed")),
      },
    );
  };

  const columns = [
    {
      title: t("teacher.center"),
      key: "center",
      render: (_: unknown, a: Affiliation) => (
        <Space>
          <BankOutlined style={{ color: "#0fa5e9" }} />
          <span style={{ fontWeight: 600 }}>{a.center?.name ?? t("teacher.unknownCenter")}</span>
          {a.center?.shortId && <span style={{ fontSize: 12, color: "#888" }}>#{a.center.shortId}</span>}
        </Space>
      ),
    },
    {
      title: t("teacher.status"),
      key: "status",
      render: (_: unknown, a: Affiliation) => <Tag color={statusColor[a.status]}>{statusLabel(a.status)}</Tag>,
    },
    {
      title: t("teacher.invited"),
      key: "invitedAt",
      render: (_: unknown, a: Affiliation) =>
        a.invitedAt ? formatDate(a.invitedAt) : "—",
    },
    {
      title: t("teacher.expires"),
      key: "expiresAt",
      render: (_: unknown, a: Affiliation) => {
        if (a.status !== "pending" || !a.expiresAt) return "—";
        const exp = dayjs(a.expiresAt);
        const days = exp.diff(dayjs(), "day");
        return (
          <span style={{ color: days <= 2 ? "#d4380d" : undefined }}>
            {formatDate(a.expiresAt)}
            {days >= 0 ? ` · ${days} ${t("teacher.daysLeft")}` : ` · ${t("teacher.expiredLabel")}`}
          </span>
        );
      },
    },
    {
      title: t("teacher.actions"),
      key: "actions",
      render: (_: unknown, a: Affiliation) => {
        if (a.status !== "pending") return null;
        const id = a.id || a._id || "";
        return (
          <Space>
            <Popconfirm
              title={t("teacher.acceptConfirm")}
              description={t("teacher.acceptConfirmDesc")}
              onConfirm={() => handleAction(id, "accept")}
              okText={t("teacher.accept")}
            >
              <Button size="small" type="primary" icon={<CheckOutlined />} loading={mutation.isPending}>
                {t("teacher.accept")}
              </Button>
            </Popconfirm>
            <Popconfirm
              title={t("teacher.declineConfirm")}
              onConfirm={() => handleAction(id, "decline")}
              okText={t("teacher.decline")}
              okButtonProps={{ danger: true }}
            >
              <Button size="small" danger icon={<CloseOutlined />}>
                {t("teacher.decline")}
              </Button>
            </Popconfirm>
          </Space>
        );
      },
    },
  ];

  const pendingCount = affiliations.filter((a) => a.status === "pending").length;

  return (
    <Card
      title={
        <Space>
          <span>{t("teacher.myCenters")}</span>
          {pendingCount > 0 && <Tag color="blue">{pendingCount} {t("teacher.pendingLabel")}</Tag>}
        </Space>
      }
    >
      {query.isLoading ? (
        <div style={{ textAlign: "center", padding: 40, color: "#888" }}>{t("common.loading")}</div>
      ) : affiliations.length === 0 ? (
        <Empty description={t("teacher.noAffiliations")} />
      ) : (
        <Table
          dataSource={affiliations}
          columns={columns}
          rowKey={(r) => r.id || r._id || ""}
          pagination={false}
          size="small"
        />
      )}
    </Card>
  );
}
