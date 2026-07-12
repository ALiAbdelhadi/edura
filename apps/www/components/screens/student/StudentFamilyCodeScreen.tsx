"use client";

import React, { useState } from "react";
import { useList, useCreate, useCustom, useCustomMutation } from "@refinedev/core";
import {
  Card,
  Button,
  Space,
  Table,
  Tag,
  Form,
  Input,
  Typography,
  message,
  Popconfirm,
  Tabs,
} from "antd";
import {
  ReloadOutlined,
  LinkOutlined,
  CopyOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  UserOutlined,
} from "@ant-design/icons";
import { useI18n } from "@/components/providers/I18nProvider";

const STATUS_COLORS: Record<string, string> = {
  pending: "orange",
  approved: "green",
  rejected: "red",
  revoked: "default",
};

const STATUS_KEYS: Record<string, string> = {
  pending: "status.pending",
  approved: "status.approved",
  rejected: "status.rejected",
  revoked: "studentFamilyCode.revoked",
};

export function StudentFamilyCodeScreen() {
  const { t, formatDate } = useI18n();
  const [linkForm] = Form.useForm();
  const [activeTab, setActiveTab] = useState("code");

  const { query: codeQuery, result: codeResult } = useCustom({
    url: "me/family-code",
    method: "get",
  });
  const { mutate: rotateCode, mutation: rotateMutation } = useCustomMutation();
  const { query: linksQuery, result: linksResult } = useList({ resource: "parent-links" });
  const { mutate: createLink, mutation: createMutation } = useCreate();
  const { mutate: approveMut, mutation: approveMutation } = useCustomMutation();
  const { mutate: rejectMut, mutation: rejectMutation } = useCustomMutation();

  const code = (codeResult?.data as any)?.code ?? "—";
  const links = (linksResult?.data ?? []) as any[];

  const handleRotate = () => {
    rotateCode(
      { url: "me/family-code/rotate", method: "post", values: {} },
      {
        onSuccess: () => {
          message.success(t("studentFamilyCode.codeRotated"));
          codeQuery.refetch();
        },
        onError: (err: any) => message.error(err?.message || t("studentFamilyCode.codeRotateFailed")),
      }
    );
  };

  const handleInitiate = (values: { email?: string; phone?: string }) => {
    const payload = values.email ? { email: values.email } : { phone: values.phone };
    createLink(
      { resource: "parent-links", values: payload },
      {
        onSuccess: () => {
          message.success(t("studentFamilyCode.linkRequestSent"));
          linkForm.resetFields();
          linksQuery.refetch();
        },
        onError: (err: any) => message.error(err?.message || t("studentFamilyCode.linkRequestFailed")),
      }
    );
  };

  const handleApprove = (id: string) => {
    approveMut(
      { url: `parent-links/${id}/approve`, method: "post", values: {} },
      {
        onSuccess: () => {
          message.success(t("studentFamilyCode.linkApproved"));
          linksQuery.refetch();
        },
        onError: (err: any) => message.error(err?.message || t("studentFamilyCode.linkApproveFailed")),
      }
    );
  };

  const handleReject = (id: string) => {
    rejectMut(
      { url: `parent-links/${id}/reject`, method: "post", values: {} },
      {
        onSuccess: () => {
          message.success(t("studentFamilyCode.linkRejected"));
          linksQuery.refetch();
        },
        onError: (err: any) => message.error(err?.message || t("studentFamilyCode.linkRejectFailed")),
      }
    );
  };

  const columns = [
    {
      title: t("roles.parent"),
      key: "parent",
      render: (_: any, record: any) => {
        const parent = record.parentId;
        return (
          <Space>
            <UserOutlined />
            <span>{parent?.name || t("studentFamilyCode.unknown")}</span>
          </Space>
        );
      },
    },
    {
      title: t("studentFamilyCode.status"),
      dataIndex: "status",
      key: "status",
      render: (v: string) => (
        <Tag color={STATUS_COLORS[v] || "default"}>{v ? t(STATUS_KEYS[v] || v) : "—"}</Tag>
      ),
    },
    {
      title: t("studentFamilyCode.initiatedBy"),
      dataIndex: "initiatedBy",
      key: "initiatedBy",
      render: (v: string) => (v === "parent" ? t("roles.parent") : t("studentFamilyCode.you")),
    },
    {
      title: t("studentFamilyCode.date"),
      dataIndex: "createdAt",
      key: "createdAt",
      render: (v: string) => (v ? formatDate(v) : "—"),
    },
    {
      title: t("studentFamilyCode.actions"),
      key: "actions",
      render: (_: any, record: any) => {
        const id = record.id || record._id;
        if (record.status === "pending" && record.initiatedBy === "parent") {
          return (
            <Space>
              <Button
                type="link"
                size="small"
                icon={<CheckCircleOutlined />}
                onClick={() => handleApprove(id)}
                loading={approveMutation.isPending}
              >
                {t("actions.approve")}
              </Button>
              <Button
                type="link"
                danger
                size="small"
                icon={<CloseCircleOutlined />}
                onClick={() => handleReject(id)}
                loading={rejectMutation.isPending}
              >
                {t("actions.reject")}
              </Button>
            </Space>
          );
        }
        return <span style={{ color: "#888" }}>—</span>;
      },
    },
  ];

  return (
    <Space direction="vertical" size="middle" style={{ width: "100%" }}>
      <Card title={t("nav.family")} loading={codeQuery.isLoading}>
        <Space direction="vertical" size="middle" style={{ width: "100%" }}>
          <Typography.Text copyable={{ icon: <CopyOutlined />, text: code }} style={{ fontSize: 24, fontFamily: "monospace", letterSpacing: 2 }}>
            {code}
          </Typography.Text>
          <Typography.Text type="secondary">
            {t("studentFamilyCode.shareCodeHint")}
          </Typography.Text>
          <Button icon={<ReloadOutlined />} onClick={handleRotate} loading={rotateMutation.isPending}>
            {t("studentFamilyCode.rotateCode")}
          </Button>
        </Space>
      </Card>

      <Card title={t("studentFamilyCode.linkParent")}>
        <Form form={linkForm} layout="vertical" onFinish={handleInitiate} autoComplete="off">
          <Form.Item
            label={t("studentFamilyCode.parentEmailOrPhone")}
            required
            style={{ marginBottom: 8 }}
          >
            <Space.Compact style={{ width: "100%" }}>
              <Form.Item
                name="email"
                noStyle
                rules={[{ type: "email", message: t("studentFamilyCode.invalidEmail") }]}
              >
                <Input placeholder="parent@example.com" style={{ width: "70%" }} />
              </Form.Item>
              <Button type="primary" htmlType="submit" loading={createMutation.isPending} icon={<LinkOutlined />}>
                {t("studentFamilyCode.sendRequest")}
              </Button>
            </Space.Compact>
          </Form.Item>
        </Form>
      </Card>

      <Card title={t("studentFamilyCode.linkRequests")} loading={linksQuery.isLoading}>
        <Table
          dataSource={links}
          columns={columns}
          rowKey={(record) => record.id || record._id}
          pagination={{ pageSize: 10 }}
          locale={{ emptyText: t("studentFamilyCode.noLinkRequests") }}
        />
      </Card>
    </Space>
  );
}
