"use client";

import React, { useState } from "react";
import { useList, useCreate, useDelete, useCustomMutation } from "@refinedev/core";
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
  LinkOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  DeleteOutlined,
  UserOutlined,
} from "@ant-design/icons";
import { useI18n } from "@/components/providers/I18nProvider";

const STATUS_COLORS: Record<string, string> = {
  pending: "orange",
  approved: "green",
  rejected: "red",
  revoked: "default",
};

export function ParentLinkingScreen() {
  const { t, formatDate } = useI18n();
  const [activeTab, setActiveTab] = useState("code");
  const [codeForm] = Form.useForm();
  const [lookupForm] = Form.useForm();

  const { query: linksQuery, result: linksResult } = useList({ resource: "parent-links" });
  const { mutate: createLink, mutation: createMutation } = useCreate();
  const { mutate: approveMut, mutation: approveMutation } = useCustomMutation();
  const { mutate: rejectMut, mutation: rejectMutation } = useCustomMutation();
  const { mutate: revokeLink, mutation: revokeMutation } = useDelete();

  const links = (linksResult?.data ?? []) as any[];

  const handleLinkByCode = (values: { code: string }) => {
    createLink(
      { resource: "parent-links", values: { code: values.code } },
      {
        onSuccess: () => {
          message.success(t("parentLinking.linkedSuccess"));
          codeForm.resetFields();
          linksQuery.refetch();
        },
        onError: (err: any) => message.error(err?.message || t("parentLinking.failedLink")),
      }
    );
  };

  const handleLinkByLookup = (values: { email?: string; phone?: string }) => {
    const payload = values.email ? { email: values.email } : { phone: values.phone };
    createLink(
      { resource: "parent-links", values: payload },
      {
        onSuccess: () => {
          message.success(t("parentLinking.linkRequestSent"));
          lookupForm.resetFields();
          linksQuery.refetch();
        },
        onError: (err: any) => message.error(err?.message || t("parentLinking.failedSendRequest")),
      }
    );
  };

  const handleApprove = (id: string) => {
    approveMut(
      { url: `parent-links/${id}/approve`, method: "post", values: {} },
      {
        onSuccess: () => {
          message.success(t("parentLinking.linkApproved"));
          linksQuery.refetch();
        },
        onError: (err: any) => message.error(err?.message || t("parentLinking.failedApprove")),
      }
    );
  };

  const handleReject = (id: string) => {
    rejectMut(
      { url: `parent-links/${id}/reject`, method: "post", values: {} },
      {
        onSuccess: () => {
          message.success(t("parentLinking.linkRejected"));
          linksQuery.refetch();
        },
        onError: (err: any) => message.error(err?.message || t("parentLinking.failedReject")),
      }
    );
  };

  const handleRevoke = (id: string) => {
    revokeLink(
      { resource: "parent-links", id },
      {
        onSuccess: () => {
          message.success(t("parentLinking.linkRevoked"));
          linksQuery.refetch();
        },
        onError: (err: any) => message.error(err?.message || t("parentLinking.failedRevoke")),
      }
    );
  };

  const columns = [
    {
      title: t("parentLinking.student"),
      key: "student",
      render: (_: any, record: any) => {
        const student = record.studentId;
        return (
          <Space>
            <UserOutlined />
            <span>{student?.name || t("parentLinking.unknown")}</span>
          </Space>
        );
      },
    },
    {
      title: t("parentLinking.status"),
      dataIndex: "status",
      key: "status",
      render: (v: string) => (
        <Tag color={STATUS_COLORS[v] || "default"}>{v === "revoked" ? t("parentLinking.revoked") : t(`status.${v}`)}</Tag>
      ),
    },
    {
      title: t("parentLinking.initiatedBy"),
      dataIndex: "initiatedBy",
      key: "initiatedBy",
      render: (v: string) => (v === "parent" ? t("parentLinking.you") : t("roles.student")),
    },
    {
      title: t("parentLinking.date"),
      dataIndex: "createdAt",
      key: "createdAt",
      render: (v: string) => (v ? formatDate(v) : "—"),
    },
    {
      title: t("parentLinking.actionsColumn"),
      key: "actions",
      render: (_: any, record: any) => {
        const id = record.id || record._id;
        if (record.status === "pending" && record.initiatedBy === "student") {
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
        if (record.status === "approved") {
          return (
            <Popconfirm
              title={t("parentLinking.revokeConfirmTitle")}
              description={t("parentLinking.revokeConfirmDesc")}
              onConfirm={() => handleRevoke(id)}
              okButtonProps={{ loading: revokeMutation.isPending, danger: true }}
            >
              <Button type="link" danger size="small" icon={<DeleteOutlined />}>
                {t("parentLinking.revoke")}
              </Button>
            </Popconfirm>
          );
        }
        return <span style={{ color: "#888" }}>—</span>;
      },
    },
  ];

  return (
    <Space direction="vertical" size="middle" style={{ width: "100%" }}>
      <Card title={t("parentLinking.linkChild")}>
        <Tabs activeKey={activeTab} onChange={setActiveTab}>
          <Tabs.TabPane tab={t("parentLinking.byFamilyCode")} key="code">
            <Form form={codeForm} layout="vertical" onFinish={handleLinkByCode} autoComplete="off">
              <Form.Item
                label={t("nav.family")}
                name="code"
                rules={[{ required: true, message: t("parentLinking.enterFamilyCode") }]}
              >
                <Input.Search
                  placeholder={t("parentLinking.enterCode")}
                  enterButton={<><LinkOutlined /> {t("parentLinking.linkInstantly")}</>}
                  loading={createMutation.isPending}
                  onSearch={() => codeForm.submit()}
                />
              </Form.Item>
            </Form>
          </Tabs.TabPane>
          <Tabs.TabPane tab={t("parentLinking.byEmailOrPhone")} key="lookup">
            <Form form={lookupForm} layout="vertical" onFinish={handleLinkByLookup} autoComplete="off">
              <Form.Item
                label={t("parentLinking.studentEmailOrPhone")}
                required
                style={{ marginBottom: 8 }}
              >
                <Space.Compact style={{ width: "100%" }}>
                  <Form.Item
                    name="email"
                    noStyle
                    rules={[{ type: "email", message: t("parentLinking.invalidEmail") }]}
                  >
                    <Input placeholder="student@example.com" style={{ width: "70%" }} />
                  </Form.Item>
                  <Button type="primary" htmlType="submit" loading={createMutation.isPending} icon={<LinkOutlined />}>
                    {t("parentLinking.sendRequest")}
                  </Button>
                </Space.Compact>
              </Form.Item>
            </Form>
          </Tabs.TabPane>
        </Tabs>
      </Card>

      <Card title={t("parentLinking.myChildren")} loading={linksQuery.isLoading}>
        <Table
          dataSource={links}
          columns={columns}
          rowKey={(record) => record.id || record._id}
          pagination={{ pageSize: 10 }}
          locale={{ emptyText: t("parentLinking.noLinkedChildren") }}
        />
      </Card>
    </Space>
  );
}
