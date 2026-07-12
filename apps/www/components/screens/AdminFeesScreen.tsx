"use client";

import React, { useMemo, useState } from "react";
import { useList, useCreate, useCustom } from "@refinedev/core";
import { Table, Card, Button, Tag, Space, Modal, Form, Row, Col, Statistic, Select, InputNumber, message, DatePicker } from "antd";
import type { Dayjs } from "dayjs";
import { PlusOutlined, DollarOutlined, FileTextOutlined, BarChartOutlined } from "@ant-design/icons";
import CopyableText from "@/components/shared/CopyableText";
import StudentLink from "@/components/shared/StudentLink";
import { LineChart } from "@/components/charts";
import { useI18n } from "@/components/providers/I18nProvider";

export function AdminFeesScreen() {
  const { t, formatEGP, formatShortEGP, formatDate } = useI18n();
  const [range, setRange] = useState<[Dayjs, Dayjs] | null>(null);
  const dateQuery = useMemo(
    () => ({
      ...(range?.[0] ? { from: range[0].format("YYYY-MM-DD") } : {}),
      ...(range?.[1] ? { to: range[1].format("YYYY-MM-DD") } : {}),
    }),
    [range],
  );

  const paymentFilters = useMemo(() => {
    const filters: Array<{ field: string; operator: "eq"; value: string }> = [];
    if (dateQuery.from) filters.push({ field: "from", operator: "eq", value: dateQuery.from });
    if (dateQuery.to) filters.push({ field: "to", operator: "eq", value: dateQuery.to });
    return filters;
  }, [dateQuery]);

  const { query: paymentsQuery, result: paymentsResult } = useList({
    resource: "payments",
    filters: paymentFilters,
  });
  const { query: reportsQuery, result: reportsResult } = useCustom({
    url: "reports/net-profit",
    method: "get",
    config: { query: dateQuery },
  });
  const { query: studentsQuery, result: studentsResult } = useList({
    resource: "students",
    pagination: { mode: "off" },
  });
  const { query: coursesQuery, result: coursesResult } = useList({
    resource: "courses",
    pagination: { mode: "off" },
  });
  const { result: enrollmentsResult } = useList({
    resource: "enrollments",
    filters: [{ field: "status", operator: "eq", value: "active" }],
    pagination: { mode: "off" },
  });
  const { mutate: createPayment, mutation: createMutation } = useCreate();

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [form] = Form.useForm();

  const payments = (paymentsResult?.data ?? []) as any[];
  const reports = (reportsResult?.data as any) || null;
  const students = (studentsResult?.data ?? []) as any[];
  const courses = (coursesResult?.data ?? []) as any[];
  const enrollments = (enrollmentsResult?.data ?? []) as any[];

  const studentOptions = useMemo(
    () =>
      students.map((s) => ({
        value: String(s.id || s.studentId || s._id),
        label: `${s.name || t("adminManage.fees.unnamedStudent")}${s.email ? ` (${s.email})` : ""}`,
      })),
    [students],
  );

  const courseOptions = useMemo(
    () =>
      courses.map((c) => ({
        value: String(c.id || c._id),
        label: c.title || c.subject || t("adminManage.fees.untitledClass"),
      })),
    [courses],
  );

  const handleRecordPayment = (values: { studentId: string; courseId: string; amount: number }) => {
    const amountPiastres = Math.round(Number(values.amount) * 100);
    if (!Number.isFinite(amountPiastres) || amountPiastres <= 0) {
      message.error(t("adminManage.fees.validAmountError"));
      return;
    }

    createPayment(
      {
        resource: "payments",
        values: {
          studentId: values.studentId,
          courseId: values.courseId,
          amount: amountPiastres,
        },
      },
      {
        onSuccess: () => {
          setIsFormOpen(false);
          form.resetFields();
          message.success(t("adminManage.fees.paymentRecorded"));
          paymentsQuery.refetch();
          reportsQuery.refetch();
        },
        onError: (err: any) => message.error(err?.message || t("adminManage.fees.recordFailed")),
      }
    );
  };

  const revenue = reports?.revenue || 0;
  const expenses = reports?.expenses || 0;
  const netProfit = reports?.netProfit || 0;
  const totalOwed = enrollments.reduce((sum: number, row: any) => sum + (row.coursePrice ?? 0), 0);

  const paymentTrendSeries = useMemo(() => {
    const monthMap = new Map<string, { label: string; netPaid: number }>();
    for (const payment of payments) {
      if (!payment?.paidAt) continue;
      const date = new Date(payment.paidAt);
      const period = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
      const label = formatDate(date, { month: "short", year: "2-digit" });
      const existing = monthMap.get(period) ?? { label, netPaid: 0 };
      existing.netPaid += payment.amount ?? 0;
      monthMap.set(period, existing);
    }
    const ordered = Array.from(monthMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, value]) => value)
      .slice(-8);
    let cumulativePaid = 0;
    let cumulativeNet = 0;
    const points = ordered.map((row) => {
      cumulativeNet += row.netPaid;
      if (row.netPaid > 0) cumulativePaid += row.netPaid;
      return {
        label: row.label,
        paid: cumulativePaid,
        outstanding: Math.max(totalOwed - cumulativeNet, 0),
      };
    });
    return [
      {
        id: "paid",
        label: t("adminManage.fees.paid"),
        color: "#22c55f",
        points: points.map((row) => ({ x: row.label, value: row.paid })),
      },
      {
        id: "outstanding",
        label: t("adminManage.fees.outstanding"),
        color: "#f97315",
        points: points.map((row) => ({ x: row.label, value: row.outstanding })),
      },
    ];
  }, [payments, totalOwed]);

  const columns = [
    {
      title: t("adminManage.fees.student"),
      dataIndex: "studentName",
      key: "studentName",
      render: (v: string, record: any) => (
        <StudentLink studentId={record.studentId} name={v || t("adminManage.fees.unknownStudent")} />
      ),
    },
    {
      title: t("adminManage.fees.userId"),
      key: "studentId",
      render: (_: any, record: any) => (
        <CopyableText value={record.studentId} label={t("adminManage.fees.userId")} />
      ),
    },
    {
      title: t("adminManage.fees.course"),
      dataIndex: "courseName",
      key: "courseName",
      render: (v: string) => v || t("adminManage.fees.unknownCourse"),
    },
    {
      title: t("adminManage.fees.amount"),
      key: "amount",
      render: (_: any, record: any) => (
        <span style={{ color: record.type === "refund" ? "#f97315" : "#22c55f", fontWeight: 600 }}>
          {record.type === "refund" ? "-" : ""}
          {formatEGP(record.amount)}
        </span>
      ),
    },
    {
      title: t("adminManage.fees.date"),
      key: "date",
      render: (_: any, record: any) => {
        if (!record.paidAt) return t("adminManage.fees.notAvailable");
        try {
          return formatDate(record.paidAt, { month: "short", day: "numeric", year: "numeric" });
        } catch {
          return t("adminManage.fees.notAvailable");
        }
      },
    },
    {
      title: t("adminManage.fees.receiptNumber"),
      dataIndex: "receiptNumber",
      key: "receiptNumber",
      render: (v: string) => <CopyableText value={v} label={t("adminManage.fees.receiptNumberLabel")} />,
    },
    {
      title: t("adminManage.fees.recordedBy"),
      dataIndex: "adminName",
      key: "adminName",
      render: (v: string) => v || t("roles.admin"),
    },
    {
      title: t("adminManage.fees.type"),
      key: "type",
      render: (_: any, record: any) => (
        <Tag color={record.type === "refund" ? "orange" : "green"}>
          {record.type === "refund" ? t("adminManage.fees.refund") : t("adminManage.fees.receipt")}
        </Tag>
      ),
    },
  ];

  return (
    <Space direction="vertical" size="middle" style={{ width: "100%" }}>
      <Card size="small">
        <Space wrap style={{ width: "100%", justifyContent: "space-between" }}>
          <Space>
            <span style={{ fontWeight: 600 }}>{t("adminManage.fees.dateRange")}</span>
            <DatePicker.RangePicker
              value={range as any}
              onChange={(values) => {
                if (values && values[0] && values[1]) setRange([values[0], values[1]]);
                else setRange(null);
              }}
            />
          </Space>
          <Button onClick={() => setRange(null)}>{t("adminManage.fees.reset")}</Button>
        </Space>
      </Card>

      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={8}>
          <Card>
            <Statistic
              title={t("adminManage.fees.revenueTotal")}
              value={formatEGP(revenue)}
              valueStyle={{ color: "#22c55f" }}
              prefix={<DollarOutlined />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={8}>
          <Card>
            <Statistic
              title={t("adminManage.fees.expensesTotal")}
              value={formatEGP(expenses)}
              valueStyle={{ color: "#f97315" }}
              prefix={<FileTextOutlined />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={8}>
          <Card>
            <Statistic
              title={t("adminManage.fees.netProfit")}
              value={formatEGP(netProfit)}
              valueStyle={{ color: "#0fa5e9" }}
              prefix={<BarChartOutlined />}
            />
          </Card>
        </Col>
      </Row>

      <Card
        title={t("adminManage.fees.paymentLog")}
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setIsFormOpen(true)}>
            {t("adminManage.fees.recordPayment")}
          </Button>
        }
      >
        <Card
          size="small"
          title={t("adminManage.fees.paidVsOutstanding")}
          style={{ marginBottom: 16 }}
        >
          <LineChart
            series={paymentTrendSeries}
            showArea
            yValueFormatter={(value) => formatShortEGP(value)}
            emptyText={t("adminManage.fees.notEnoughHistory")}
          />
        </Card>
        <Table
          dataSource={payments}
          columns={columns}
          rowKey={(record) => record.id || record._id}
          loading={paymentsQuery.isLoading}
          pagination={{ pageSize: 10 }}
          locale={{ emptyText: t("adminManage.fees.noPayments") }}
        />
      </Card>

      <Modal
        title={t("adminManage.fees.recordPayment")}
        open={isFormOpen}
        onCancel={() => setIsFormOpen(false)}
        footer={null}
      >
        <Form form={form} layout="vertical" onFinish={handleRecordPayment}>
          <Form.Item
            name="studentId"
            label={t("adminManage.fees.student")}
            rules={[{ required: true, message: t("adminManage.fees.selectStudentRequired") }]}
          >
            <Select
              showSearch
              placeholder={t("adminManage.fees.selectStudent")}
              options={studentOptions}
              loading={studentsQuery.isLoading}
              optionFilterProp="label"
            />
          </Form.Item>
          <Form.Item
            name="courseId"
            label={t("adminManage.fees.class")}
            rules={[{ required: true, message: t("adminManage.fees.selectClassRequired") }]}
          >
            <Select
              showSearch
              placeholder={t("adminManage.fees.selectClass")}
              options={courseOptions}
              loading={coursesQuery.isLoading}
              optionFilterProp="label"
            />
          </Form.Item>
          <Form.Item
            name="amount"
            label={t("adminManage.fees.amountEgp")}
            rules={[{ required: true, message: t("adminManage.fees.enterAmountRequired") }]}
          >
            <InputNumber min={0.01} step={10} precision={2} placeholder="800" style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item style={{ marginBottom: 0 }}>
            <Space style={{ justifyContent: "flex-end", display: "flex" }}>
              <Button onClick={() => setIsFormOpen(false)}>{t("actions.cancel")}</Button>
              <Button type="primary" htmlType="submit" loading={createMutation.isPending}>
                {t("adminManage.fees.record")}
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </Space>
  );
}
