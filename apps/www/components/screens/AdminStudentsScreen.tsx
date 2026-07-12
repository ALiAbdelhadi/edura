"use client";

import React, { useState, Suspense } from "react";
import { useList, useUpdate, useCustomMutation, useInvalidate } from "@refinedev/core";
import { Table, Card, Input, Button, Tag, Popconfirm, Space, Statistic, Row, Col, Modal, Form, message as antMessage } from "antd";
import { UserOutlined, TeamOutlined, BellOutlined, UserAddOutlined } from "@ant-design/icons";
import FilterBar from "@/components/shared/FilterBar";
import CopyableText from "@/components/shared/CopyableText";
import StudentLink from "@/components/shared/StudentLink";
import { useI18n } from "@/components/providers/I18nProvider";

export function AdminStudentsScreen() {
  const { t, formatDate } = useI18n();
  const { query, result } = useList({ resource: "students" });
  const { result: pendingRequestsResult } = useList({
    resource: "enrollment-requests",
    filters: [{ field: "status", operator: "eq", value: "pending" }],
    pagination: { mode: "off" },
  });
  const { mutate: updateStudent, mutation: updateMutation } = useUpdate();
  const { mutate: invite, mutation: inviteMutation } = useCustomMutation();
  const invalidate = useInvalidate();

  const [filterValues, setFilterValues] = useState<Record<string, string>>({});
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [inviteForm] = Form.useForm();

  const students = (result?.data ?? []) as any[];

  const searchTerm = filterValues.q || "";
  const statusFilter = filterValues.status || "";
  const filtered = students.filter((s: any) => {
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      const matchesSearch =
        (s.name || "").toLowerCase().includes(q) ||
        (s.email || "").toLowerCase().includes(q);
      if (!matchesSearch) return false;
    }
    if (statusFilter) {
      if (statusFilter === "blacklisted") return s.blacklisted;
      return !s.blacklisted && (s.status || "active") === statusFilter;
    }
    return true;
  });

  const handleUnblacklist = (id: string) => {
    updateStudent(
      { resource: "students", id, values: { blacklisted: false } },
      {
        onSuccess: () => antMessage.success(t("adminHome.students_unblacklistSuccess")),
        onError: (err) => antMessage.error((err as any)?.message || t("adminHome.students_unblacklistFailed")),
      },
    );
  };

  const handleBlacklist = (id: string, reason: string) => {
    updateStudent(
      { resource: "students", id, values: { blacklisted: true, blacklistReason: reason } },
      {
        onSuccess: () => antMessage.success(t("adminHome.students_blacklistSuccess")),
        onError: (err) => antMessage.error((err as any)?.message || t("adminHome.students_blacklistFailed")),
      },
    );
  };

  const handleInvite = (values: { email: string; name?: string }) => {
    invite(
      { url: "roster/students/invite", method: "post", values },
      {
        onSuccess: () => {
          antMessage.success(`${t("adminHome.students_inviteSent")} ${values.email}`);
          inviteForm.resetFields();
          setIsInviteOpen(false);
          invalidate({ resource: "students", invalidates: ["list"] });
        },
        onError: (err) => {
          antMessage.error((err as { message?: string })?.message || t("adminHome.students_inviteFailed"));
        },
      },
    );
  };

  const totalStudents = students.length;
  const blacklistedCount = students.filter((s: any) => s.blacklisted).length;
  const pendingRequestsCount = pendingRequestsResult?.total ?? (pendingRequestsResult?.data?.length ?? 0);

  const columns = [
    {
      title: t("adminHome.students_colStudent"),
      dataIndex: "name",
      key: "name",
      render: (_: any, record: any) => {
        const id = String(record.studentId || record.id || record._id || "");
        return (
          <Space>
            <UserOutlined />
            <StudentLink studentId={id} name={record.name || record.user?.name} />
          </Space>
        );
      },
    },
    {
      title: t("adminHome.students_colUserId"),
      key: "userId",
      render: (_: any, record: any) => (
        <CopyableText value={record.studentId || record.id || record._id} label="User ID" />
      ),
    },
    {
      title: t("auth.email"),
      dataIndex: "email",
      key: "email",
      render: (_: any, record: any) => record.email || record.user?.email,
    },
    {
      title: t("nav.courses"),
      dataIndex: "coursesCount",
      key: "coursesCount",
      render: (v: number) => v || 0,
    },
    {
      title: t("adminHome.students_status"),
      key: "status",
      render: (_: any, record: any) => {
        if (record.blacklisted) {
          return <Tag color="red">{t("status.blacklisted")}</Tag>;
        }
        const status = record.status || "active";
        const colorMap: Record<string, string> = {
          active: "green",
          shell: "default",
          suspended: "orange",
        };
        const labelMap: Record<string, string> = {
          active: t("status.active"),
          shell: t("adminHome.students_statusShell"),
          suspended: t("status.suspended"),
        };
        return <Tag color={colorMap[status] || "default"}>{labelMap[status] || (status.charAt(0).toUpperCase() + status.slice(1))}</Tag>;
      },
    },
    {
      title: t("adminHome.students_colJoined"),
      key: "joined",
      render: (_: any, record: any) => {
        const dateStr = record.createdAt || record.addedAt;
        if (!dateStr) return t("adminHome.students_notAvailable");
        try {
          return formatDate(dateStr, { month: "short", year: "numeric" });
        } catch {
          return t("adminHome.students_notAvailable");
        }
      },
    },
    {
      title: t("adminHome.students_colActions"),
      key: "actions",
      render: (_: any, record: any) => {
        const id = record.id || record._id;
        return (
          <Space>
            {record.blacklisted ? (
              <Popconfirm
                title={`${t("adminHome.students_unblacklist")} ${record.name || record.user?.name}?`}
                onConfirm={() => handleUnblacklist(id)}
                okButtonProps={{ loading: updateMutation.isPending }}
              >
                <Button type="link" size="small" style={{ color: "#22c55f" }}>
                  {t("adminHome.students_unblacklist")}
                </Button>
              </Popconfirm>
            ) : (
              <Popconfirm
                title={`${t("actions.blacklist")} ${record.name || record.user?.name}?`}
                description={
                  <Input
                    placeholder={t("adminHome.students_reasonRequired")}
                    onChange={(e) => record._reason = e.target.value}
                    style={{ marginTop: 8 }}
                  />
                }
                onConfirm={() => handleBlacklist(id, record._reason || "")}
                okButtonProps={{ loading: updateMutation.isPending, disabled: !record._reason }}
              >
                <Button type="link" danger size="small">
                  {t("actions.blacklist")}
                </Button>
              </Popconfirm>
            )}
          </Space>
        );
      },
    },
  ];

  return (
    <Space direction="vertical" size="middle" style={{ width: "100%" }}>
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={8}>
          <Card>
            <Statistic
              title={t("adminHome.students_totalStudents")}
              value={totalStudents}
              prefix={<TeamOutlined />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={8}>
          <Card>
            <Statistic
              title={t("adminHome.students_pendingRequests")}
              value={pendingRequestsCount}
              prefix={<BellOutlined />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={8}>
          <Card>
            <Statistic
              title={t("status.blacklisted")}
              value={blacklistedCount}
              valueStyle={{ color: "#cf1322" }}
              prefix={<BellOutlined />}
            />
          </Card>
        </Col>
      </Row>

      <Card
        title={t("nav.students")}
        extra={
          <Space>
            <Suspense fallback={null}>
              <FilterBar
                searchField={{ key: "q", placeholder: t("adminHome.students_searchPlaceholder") }}
                facets={[
                  {
                    key: "status",
                    placeholder: t("adminHome.students_status"),
                    options: [
                      { label: t("status.active"), value: "active" },
                      { label: t("adminHome.students_statusShell"), value: "shell" },
                      { label: t("status.blacklisted"), value: "blacklisted" },
                    ],
                  },
                ]}
                onFilterChange={setFilterValues}
              />
            </Suspense>
            <Button type="primary" icon={<UserAddOutlined />} onClick={() => setIsInviteOpen(true)}>
              {t("adminHome.students_addStudent")}
            </Button>
          </Space>
        }
      >
        <Table
          dataSource={filtered}
          columns={columns}
          rowKey={(record) => record.id || record._id}
          loading={query.isLoading}
          pagination={{ pageSize: 10 }}
          locale={{ emptyText: t("adminHome.students_noStudents") }}
        />
      </Card>

      <Modal
        title={t("adminHome.students_inviteStudent")}
        open={isInviteOpen}
        onCancel={() => { setIsInviteOpen(false); inviteForm.resetFields(); }}
        onOk={() => inviteForm.submit()}
        confirmLoading={inviteMutation.isPending}
        okText={t("actions.sendInvite")}
        destroyOnClose
      >
        <p style={{ color: "#666", marginTop: 0 }}>
          {t("adminHome.students_inviteHint")}
        </p>
        <Form form={inviteForm} layout="vertical" onFinish={handleInvite}>
          <Form.Item
            name="email"
            label={t("auth.email")}
            rules={[{ required: true, message: t("adminHome.students_emailRequired") }, { type: "email", message: t("adminHome.students_invalidEmail") }]}
          >
            <Input placeholder="student@example.com" autoFocus />
          </Form.Item>
          <Form.Item name="name" label={t("adminHome.students_nameOptional")}>
            <Input placeholder={t("adminHome.students_fullName")} />
          </Form.Item>
        </Form>
      </Modal>
    </Space>
  );
}
