"use client";

import React, { useState } from "react";
import { useList, useDelete, useCustomMutation } from "@refinedev/core";
import { Table, Card, Input, Button, Tag, Popconfirm, Space, Modal, Form, Avatar, message } from "antd";
import { PlusOutlined, DeleteOutlined } from "@ant-design/icons";
import { useI18n } from "@/components/providers/I18nProvider";

export function AdminTeachersScreen() {
  const { t } = useI18n();
  const { query, result } = useList({ resource: "teachers" });
  const { mutate: deleteTeacher, mutation: deleteMutation } = useDelete();
  const { mutate: inviteTeacher, mutation: inviteMutation } = useCustomMutation();

  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [inviteForm] = Form.useForm();

  const teachers = (result?.data ?? []) as any[];

  const handleInvite = (values: { email: string; name?: string }) => {
    inviteTeacher(
      {
        url: "roster/teachers/invite",
        method: "post",
        values: { email: values.email, name: values.name || values.email.split("@")[0], createShell: true },
      },
      {
        onSuccess: () => {
          setIsInviteOpen(false);
          inviteForm.resetFields();
          message.success(t("adminHome.teachers_inviteSent"));
          query.refetch();
        },
        onError: (err: any) => message.error(err?.message || t("adminHome.teachers_inviteFailed")),
      }
    );
  };

  const handleRemove = (id: string) => {
    deleteTeacher(
      { resource: "teachers", id },
      {
        onSuccess: () => {
          message.success(t("adminHome.teachers_removed"));
          query.refetch();
        },
        onError: (err: any) => message.error(err?.message || t("adminHome.teachers_removeFailed")),
      },
    );
  };

  const columns = [
    {
      title: t("roles.teacher"),
      key: "teacher",
      render: (_: any, record: any) => (
        <Space>
          <Avatar style={{ backgroundColor: "#0fa5e920", color: "#0fa5e9" }}>
            {record.name?.charAt(0)?.toUpperCase()}
          </Avatar>
          <span>{record.name}</span>
        </Space>
      ),
    },
    {
      title: t("auth.email"),
      dataIndex: "email",
      key: "email",
    },
    {
      title: t("adminHome.teachers_subjects"),
      dataIndex: "subjects",
      key: "subjects",
      render: (subjects: string[]) => subjects?.join(", ") || "—",
    },
    {
      title: t("nav.courses"),
      dataIndex: "coursesCount",
      key: "coursesCount",
      render: (v: number) => v || 0,
    },
    {
      title: t("adminHome.teachers_rating"),
      key: "rating",
      render: (_: any, record: any) =>
        record.rating && record.rating > 0
          ? `${record.rating.toFixed(1)} (${record.reviewsCount || 0})`
          : t("adminHome.teachers_noReviews"),
    },
    {
      title: t("adminHome.teachers_status"),
      key: "status",
      render: (_: any, record: any) => {
        const affiliationStatus = record.affiliation?.status;
        const status = affiliationStatus || record.status || "active";
        const color = status === "active" ? "green" : status === "pending" || record.status === "shell" ? "orange" : "default";
        const label =
          status === "pending" || record.status === "shell"
            ? t("adminHome.teachers_pendingInvite")
            : t(`status.${status}`);
        return <Tag color={color}>{label}</Tag>;
      },
    },
    {
      title: t("adminHome.teachers_actions"),
      key: "actions",
      render: (_: any, record: any) => {
        const canRemove =
          record.affiliation?.status === "active" ||
          record.affiliation?.status === "pending" ||
          record.status === "active" ||
          record.status === "shell";
        const canReinvite = record.affiliation?.status === "pending" || record.status === "shell";
        return (
          <Space>
            {canRemove && (
            <Popconfirm
              title={`${t("actions.remove")} ${record.name}?`}
              onConfirm={() => handleRemove(record.id || record._id)}
              okButtonProps={{ loading: deleteMutation.isPending, danger: true }}
            >
              <Button type="link" danger size="small" icon={<DeleteOutlined />}>
                {t("actions.remove")}
              </Button>
            </Popconfirm>
            )}
            {canReinvite && (
            <Button
              type="link"
              size="small"
              onClick={() => {
                inviteForm.setFieldsValue({ email: record.email, name: record.name });
                setIsInviteOpen(true);
              }}
            >
              {t("adminHome.teachers_reinvite")}
            </Button>
            )}
          </Space>
        );
      },
    },
  ];

  return (
    <Space direction="vertical" size="middle" style={{ width: "100%" }}>
      <Card
        title={t("nav.teachers")}
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setIsInviteOpen(true)}>
            {t("adminHome.teachers_inviteTeacher")}
          </Button>
        }
      >
        <Table
          dataSource={teachers}
          columns={columns}
          rowKey={(record) => record.id || record._id}
          loading={query.isLoading}
          pagination={{ pageSize: 10 }}
          locale={{ emptyText: t("adminHome.teachers_emptyText") }}
        />
      </Card>

      <Modal
        title={t("adminHome.teachers_inviteTeacher")}
        open={isInviteOpen}
        onCancel={() => setIsInviteOpen(false)}
        footer={null}
      >
        <Form form={inviteForm} layout="vertical" onFinish={handleInvite}>
          <Form.Item
            name="email"
            label={t("auth.email")}
            rules={[{ required: true, type: "email", message: t("adminHome.teachers_invalidEmail") }]}
          >
            <Input placeholder="teacher@example.com" />
          </Form.Item>
          <Form.Item name="name" label={t("adminHome.teachers_nameOptional")}>
            <Input placeholder={t("adminHome.teachers_teacherNamePlaceholder")} />
          </Form.Item>
          <Form.Item style={{ marginBottom: 0 }}>
            <Space style={{ justifyContent: "flex-end", display: "flex" }}>
              <Button onClick={() => setIsInviteOpen(false)}>{t("actions.cancel")}</Button>
              <Button type="primary" htmlType="submit" loading={inviteMutation.isPending}>
                {t("actions.sendInvite")}
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </Space>
  );
}
