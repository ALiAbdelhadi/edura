"use client";

import React, { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useCustom, useList, useCustomMutation } from "@refinedev/core";
import {
  Button,
  Card,
  Col,
  Descriptions,
  Modal,
  Form,
  Input,
  Row,
  Space,
  Statistic,
  Table,
  Tag,
  message,
} from "antd";
import {
  ArrowLeftOutlined,
  BookOutlined,
  DollarOutlined,
  EditOutlined,
  UserOutlined,
  StopOutlined,
  CheckCircleOutlined,
} from "@ant-design/icons";
import CopyableText from "@/components/shared/CopyableText";
import { useI18n } from "@/components/providers/I18nProvider";

type StudentUser = {
  _id?: string;
  id?: string;
  name?: string;
  email?: string;
  phone?: string;
  status?: string;
};

type StudentRosterRecord = {
  _id?: string;
  id?: string;
  studentId?: string;
  user?: StudentUser | null;
  blacklisted?: boolean;
  blacklistReason?: string;
  addedAt?: string;
  leftAt?: string | null;
  operationalParentName?: string;
  operationalParentPhone?: string;
};

export function AdminStudentDetailScreen() {
  const { t, formatEGP, formatDate } = useI18n();
  const params = useParams<{ studentId?: string | string[] }>();
  const router = useRouter();
  const rawStudentId = Array.isArray(params.studentId) ? params.studentId[0] : params.studentId;
  const studentId = rawStudentId ? decodeURIComponent(rawStudentId) : "";

  const fmtDate = (value?: string | Date | null) => {
    if (!value) return t("adminHome.detail_notAvailable");
    try {
      return formatDate(value, { month: "short", day: "numeric", year: "numeric" });
    } catch {
      return t("adminHome.detail_notAvailable");
    }
  };

  const translateStatus = (s?: string) => {
    if (!s) return "";
    const key = `status.${s}`;
    const val = t(key);
    return val === key ? s.charAt(0).toUpperCase() + s.slice(1) : val;
  };

  const { query: studentQuery, result: studentResult } = useCustom<StudentRosterRecord>({
    url: studentId ? `roster/students/${studentId}` : "",
    method: "get",
    queryOptions: { enabled: !!studentId },
  });

  const { mutateAsync: patchStudent } = useCustomMutation();
  const [blacklistModalOpen, setBlacklistModalOpen] = useState(false);
  const [blacklistReason, setBlacklistReason] = useState("");
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [editForm] = Form.useForm();

  const refetch = studentQuery.refetch;

  const { query: enrollmentsQuery, result: enrollmentsResult } = useList({
    resource: "enrollments",
    filters: studentId ? [{ field: "studentId", operator: "eq" as const, value: studentId }] : undefined,
    pagination: { mode: "off" },
    queryOptions: { enabled: !!studentId },
  });

  const { query: paymentsQuery, result: paymentsResult } = useList({
    resource: "payments",
    filters: studentId ? [{ field: "studentId", operator: "eq" as const, value: studentId }] : undefined,
    pagination: { mode: "off" },
    queryOptions: { enabled: !!studentId },
  });

  const record = studentResult?.data as StudentRosterRecord | undefined;
  const user = record?.user ?? null;
  const userId = String(user?._id || user?.id || record?.studentId || studentId || "");
  const studentName = user?.name || t("adminHome.detail_unnamedStudent");
  const enrollments = (enrollmentsResult?.data ?? []) as any[];
  const payments = (paymentsResult?.data ?? []) as any[];
  const activeEnrollments = enrollments.filter((e) => (e.status || "active") === "active").length;
  const paidTotal = payments.reduce((sum, p) => sum + (p.amount > 0 ? p.amount : 0), 0);

  const profileRows = [
    {
      key: userId || "student",
      userId,
      name: studentName,
      email: user?.email,
      phone: user?.phone,
      status: record?.blacklisted ? "blacklisted" : user?.status || "active",
      addedAt: record?.addedAt,
    },
  ];

  const profileColumns = [
    {
      title: t("adminHome.detail_colUserId"),
      key: "userId",
      render: (_: unknown, row: (typeof profileRows)[number]) => (
        <CopyableText value={row.userId} label="User ID" />
      ),
    },
    {
      title: t("adminHome.detail_colStudent"),
      dataIndex: "name",
      key: "name",
      render: (value: string) => <span style={{ fontWeight: 600 }}>{value}</span>,
    },
    {
      title: t("auth.email"),
      dataIndex: "email",
      key: "email",
      render: (value?: string) => <CopyableText value={value} label="Email" monospace={false} />,
    },
    {
      title: t("adminHome.detail_phone"),
      dataIndex: "phone",
      key: "phone",
      render: (value?: string) => <CopyableText value={value} label="Phone" monospace={false} />,
    },
    {
      title: t("adminHome.detail_status"),
      dataIndex: "status",
      key: "status",
      render: (value: string) => (
        <Tag color={value === "blacklisted" ? "red" : value === "active" ? "green" : "default"}>
          {translateStatus(value)}
        </Tag>
      ),
    },
    {
      title: t("adminHome.detail_colJoined"),
      dataIndex: "addedAt",
      key: "addedAt",
      render: (value?: string) => fmtDate(value),
    },
  ];

  const enrollmentColumns = [
    {
      title: t("adminHome.detail_colClass"),
      key: "class",
      render: (_: unknown, row: any) => (
        <Space direction="vertical" size={0}>
          <span style={{ fontWeight: 600 }}>{row.courseName || t("adminHome.detail_untitledClass")}</span>
          <span style={{ fontSize: 12, color: "#888" }}>{row.subject || row.courseId}</span>
        </Space>
      ),
    },
    {
      title: t("adminHome.detail_enrollmentId"),
      key: "id",
      render: (_: unknown, row: any) => (
        <CopyableText value={row.id || row._id} label="Enrollment ID" />
      ),
    },
    {
      title: t("adminHome.detail_status"),
      key: "status",
      render: (_: unknown, row: any) => (
        <Tag color={(row.status || "active") === "active" ? "green" : "default"}>
          {translateStatus(row.status || "active")}
        </Tag>
      ),
    },
    {
      title: t("adminHome.detail_enrolled"),
      key: "enrolledAt",
      render: (_: unknown, row: any) => fmtDate(row.enrolledAt || row.createdAt),
    },
  ];

  const paymentColumns = [
    {
      title: t("adminHome.detail_receiptNumber"),
      key: "receipt",
      render: (_: unknown, row: any) => (
        <CopyableText value={row.receiptNumber} label="Receipt number" />
      ),
    },
    {
      title: t("adminHome.detail_colCourse"),
      dataIndex: "courseName",
      key: "courseName",
      render: (value?: string) => value || t("adminHome.detail_notAvailable"),
    },
    {
      title: t("adminHome.detail_amount"),
      key: "amount",
      render: (_: unknown, row: any) => (
        <span style={{ color: row.amount < 0 ? "#f97315" : "#22c55f", fontWeight: 600 }}>
          {row.amount < 0 ? "-" : ""}
          {formatEGP(Math.abs(row.amount || 0))}
        </span>
      ),
    },
    {
      title: t("adminHome.detail_paidColumn"),
      key: "paidAt",
      render: (_: unknown, row: any) => fmtDate(row.paidAt),
    },
  ];

  if (studentQuery.isLoading && !record) {
    return <div style={{ textAlign: "center", padding: 40, color: "#888" }}>{t("adminHome.detail_loadingStudent")}</div>;
  }

  if (studentQuery.error || !record) {
    return (
      <Card>
        <Space direction="vertical">
          <Button icon={<ArrowLeftOutlined />} onClick={() => router.push("/dashboard/admin/students")}>
            {t("adminHome.detail_backToStudents")}
          </Button>
          <span style={{ color: "#cf1322" }}>{t("adminHome.detail_notFound")}</span>
        </Space>
      </Card>
    );
  }

  const isBlacklisted = !!record.blacklisted;

  const handleBlacklistToggle = async () => {
    setActionLoading(true);
    try {
      await patchStudent({
        url: `roster/students/${studentId}`,
        method: "patch",
        values: {
          blacklisted: !isBlacklisted,
          blacklistReason: !isBlacklisted ? blacklistReason : undefined,
        },
      });
      message.success(isBlacklisted ? t("adminHome.detail_unblacklistSuccess") : t("adminHome.detail_blacklistSuccess"));
      setBlacklistModalOpen(false);
      setBlacklistReason("");
      refetch();
    } catch (err: any) {
      message.error(err?.message || t("adminHome.detail_actionFailed"));
    } finally {
      setActionLoading(false);
    }
  };

  const openEditModal = () => {
    editForm.setFieldsValue({
      name: user?.name || "",
      email: user?.email || "",
      phone: user?.phone || "",
    });
    setEditModalOpen(true);
  };

  const handleEditSave = async (values: { name: string; email: string; phone: string }) => {
    setActionLoading(true);
    try {
      await patchStudent({
        url: `roster/students/${studentId}`,
        method: "patch",
        values: {
          name: values.name.trim(),
          email: values.email.trim().toLowerCase(),
          phone: values.phone?.trim() || "",
        },
      });
      message.success(t("adminHome.detail_updateSuccess"));
      setEditModalOpen(false);
      refetch();
    } catch (err: any) {
      message.error(err?.message || t("adminHome.detail_updateFailed"));
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <Space direction="vertical" size="middle" style={{ width: "100%" }}>
      <Card
        title={
          <Space>
            <UserOutlined />
            <span>{studentName}</span>
            {isBlacklisted && <Tag color="red">{t("status.blacklisted")}</Tag>}
          </Space>
        }
        extra={
          <Space>
            <Button icon={<EditOutlined />} onClick={openEditModal}>
              {t("actions.edit")}
            </Button>
            <Button
              icon={isBlacklisted ? <CheckCircleOutlined /> : <StopOutlined />}
              danger={!isBlacklisted}
              type={isBlacklisted ? "primary" : "default"}
              onClick={() => {
                if (isBlacklisted) {
                  handleBlacklistToggle();
                } else {
                  setBlacklistModalOpen(true);
                }
              }}
            >
              {isBlacklisted ? t("adminHome.detail_unblacklist") : t("actions.blacklist")}
            </Button>
            <Button icon={<ArrowLeftOutlined />} onClick={() => router.push("/dashboard/admin/students")}>
              {t("adminHome.detail_backToStudents")}
            </Button>
          </Space>
        }
      >
        <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
          <Col xs={24} md={8}>
            <Statistic title={t("adminHome.detail_colUserId")} valueRender={() => <CopyableText value={userId} label="User ID" />} />
          </Col>
          <Col xs={24} md={8}>
            <Statistic title={t("adminHome.detail_activeClasses")} value={activeEnrollments} prefix={<BookOutlined />} />
          </Col>
          <Col xs={24} md={8}>
            <Statistic title={t("adminHome.detail_paidTotal")} value={formatEGP(paidTotal)} prefix={<DollarOutlined />} />
          </Col>
        </Row>

        <Descriptions size="small" bordered column={{ xs: 1, md: 2 }}>
          <Descriptions.Item label={t("auth.email")}>
            <CopyableText value={user?.email} label="Email" monospace={false} />
          </Descriptions.Item>
          <Descriptions.Item label={t("adminHome.detail_phone")}>
            <CopyableText value={user?.phone} label="Phone" monospace={false} />
          </Descriptions.Item>
          <Descriptions.Item label={t("adminHome.detail_rosterId")}>
            <CopyableText value={record._id || record.id} label="Roster ID" />
          </Descriptions.Item>
          <Descriptions.Item label={t("adminHome.detail_added")}>{fmtDate(record.addedAt)}</Descriptions.Item>
          <Descriptions.Item label={t("adminHome.detail_operationalParent")}>
            {record.operationalParentName || t("adminHome.detail_notAvailable")}
          </Descriptions.Item>
          <Descriptions.Item label={t("adminHome.detail_operationalParentPhone")}>
            <CopyableText value={record.operationalParentPhone} label="Operational parent phone" monospace={false} />
          </Descriptions.Item>
          {record.blacklisted && (
            <Descriptions.Item label={t("adminHome.detail_blacklistReason")} span={2}>
              {record.blacklistReason || t("adminHome.detail_noReason")}
            </Descriptions.Item>
          )}
        </Descriptions>
      </Card>

      <Card title={t("adminHome.detail_studentRecord")}>
        <Table
          dataSource={profileRows}
          columns={profileColumns}
          rowKey={(row) => row.userId || row.key}
          pagination={false}
          size="small"
        />
      </Card>

      <Card title={t("nav.enrollments")}>
        <Table
          dataSource={enrollments}
          columns={enrollmentColumns}
          rowKey={(row) => row.id || row._id}
          loading={enrollmentsQuery.isLoading}
          pagination={{ pageSize: 5 }}
          locale={{ emptyText: t("adminHome.detail_noEnrollments") }}
          size="small"
        />
      </Card>

      <Card title={t("adminHome.detail_payments")}>
        <Table
          dataSource={payments}
          columns={paymentColumns}
          rowKey={(row) => row.id || row._id}
          loading={paymentsQuery.isLoading}
          pagination={{ pageSize: 5 }}
          locale={{ emptyText: t("adminHome.detail_noPayments") }}
          size="small"
        />
      </Card>

      <Modal
        title={t("adminHome.detail_blacklistStudent")}
        open={blacklistModalOpen}
        onOk={handleBlacklistToggle}
        onCancel={() => { setBlacklistModalOpen(false); setBlacklistReason(""); }}
        confirmLoading={actionLoading}
        okText={t("actions.blacklist")}
        okButtonProps={{ danger: true }}
      >
        <p>{t("adminHome.detail_blacklistConfirmPrefix")}<strong>{studentName}</strong>{t("adminHome.detail_blacklistConfirmSuffix")}</p>
        <p style={{ fontSize: 13, color: "#888" }}>{t("adminHome.detail_blacklistWarning")}</p>
        <Input.TextArea
          placeholder={t("adminHome.detail_reasonOptional")}
          value={blacklistReason}
          onChange={(e) => setBlacklistReason(e.target.value)}
          rows={3}
          style={{ marginTop: 12 }}
        />
      </Modal>

      <Modal
        title={t("adminHome.detail_editStudent")}
        open={editModalOpen}
        onCancel={() => setEditModalOpen(false)}
        footer={null}
        destroyOnClose
      >
        <Form
          form={editForm}
          layout="vertical"
          onFinish={handleEditSave}
          initialValues={{ name: "", email: "", phone: "" }}
        >
          <Form.Item
            name="name"
            label={t("adminHome.detail_name")}
            rules={[{ required: true, message: t("adminHome.detail_nameRequired") }]}
          >
            <Input prefix={<UserOutlined style={{ color: "#a5a8b5" }} />} placeholder={t("adminHome.detail_studentNamePlaceholder")} size="large" />
          </Form.Item>
          <Form.Item
            name="email"
            label={t("auth.email")}
            rules={[
              { required: true, message: t("adminHome.detail_emailRequired") },
              { type: "email", message: t("adminHome.detail_invalidEmail") },
            ]}
          >
            <Input placeholder="student@example.com" size="large" />
          </Form.Item>
          <Form.Item name="phone" label={t("adminHome.detail_phone")}>
            <Input placeholder={t("adminHome.detail_phoneNumber")} size="large" />
          </Form.Item>
          <Form.Item style={{ marginBottom: 0, textAlign: "right" }}>
            <Space>
              <Button onClick={() => setEditModalOpen(false)}>{t("actions.cancel")}</Button>
              <Button type="primary" htmlType="submit" loading={actionLoading}>
                {t("actions.save")}
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </Space>
  );
}
