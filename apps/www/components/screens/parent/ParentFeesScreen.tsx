"use client";

import React, { useState } from "react";
import { useList } from "@refinedev/core";
import { Card, Table, Tag, Statistic, Row, Col, Space, DatePicker, Button } from "antd";
import { DollarOutlined, BellOutlined, BarChartOutlined } from "@ant-design/icons";
import { useChildSelector, ChildSelectorBar } from "@/components/shared/ChildSelector";
import { LineChart } from "@/components/charts";
import { useI18n } from "@/components/providers/I18nProvider";

export function ParentFeesScreen() {
  const { t, formatEGP, formatShortEGP, formatDate } = useI18n();
  const { childId, isLoading: childrenLoading } = useChildSelector();
  const [range, setRange] = useState<[any, any] | null>(null);

  const { query, result } = useList({
    resource: "payments",
    filters: childId ? [{ field: "studentId", operator: "eq", value: childId }] : undefined,
    queryOptions: { enabled: !!childId },
  });

  const childPayments = (result?.data ?? []) as any[];
  const isLoading = childrenLoading || query.isLoading;

  const paid = childPayments.filter((p: any) => p.amount > 0).reduce((a: number, b: any) => a + b.amount, 0);
  const refunds = childPayments.filter((p: any) => p.amount < 0).reduce((a: number, b: any) => a + Math.abs(b.amount), 0);
  const net = paid - refunds;

  const paymentSeries = React.useMemo(() => {
    const sorted = [...childPayments]
      .filter((payment: any) => payment.paidAt)
      .sort((a: any, b: any) => new Date(a.paidAt).getTime() - new Date(b.paidAt).getTime());
    let cumulativePaid = 0;
    let cumulativeNet = 0;
    const points = sorted.map((payment: any) => {
      const amount = payment.amount ?? 0;
      if (amount > 0) cumulativePaid += amount;
      cumulativeNet += amount;
      return {
        x: formatDate(payment.paidAt, { month: "short", day: "numeric" }),
        paid: cumulativePaid,
        net: cumulativeNet,
      };
    });
    return [
      {
        id: "paid",
        label: t("parentFees.cumulativePaid"),
        color: "#22c55f",
        points: points.map((point) => ({ x: point.x, value: point.paid })),
      },
      {
        id: "net",
        label: t("parentFees.cumulativeNet"),
        color: "#0fa5e9",
        points: points.map((point) => ({ x: point.x, value: point.net })),
      },
    ];
  }, [childPayments, t, formatDate]);

  const columns = [
    { title: t("parentFees.course"), dataIndex: "courseName", key: "courseName", render: (v: string) => v || "—" },
    {
      title: t("parentFees.amount"),
      key: "amount",
      render: (_: any, p: any) => {
        const isRefund = p.amount < 0;
        return <span style={{ color: isRefund ? "#f97315" : "#22c55f", fontWeight: 600 }}>{isRefund ? "−" : ""}{formatEGP(Math.abs(p.amount))}</span>;
      },
    },
    {
      title: t("parentFees.date"),
      key: "date",
      render: (_: any, p: any) => p.paidAt ? formatDate(p.paidAt) : "—",
    },
    { title: t("parentFees.receipt"), dataIndex: "receiptNumber", key: "receiptNumber", render: (v: string) => v || "—" },
    {
      title: t("parentFees.status"),
      key: "status",
      render: (_: any, p: any) => <Tag color={p.amount < 0 ? "orange" : "green"}>{p.amount < 0 ? t("parentFees.refund") : t("status.paid")}</Tag>,
    },
  ];

  if (isLoading && childPayments.length === 0) {
    return <div style={{ textAlign: "center", padding: 40, color: "#888" }}>{t("parentFees.loadingPayments")}</div>;
  }

  if (!childId) {
    return <div style={{ textAlign: "center", padding: 40, color: "#888" }}>{t("parentFees.noChildren")}</div>;
  }

  return (
    <Space direction="vertical" size="middle" style={{ width: "100%" }}>
      <ChildSelectorBar />
      <Card size="small">
        <Space wrap style={{ width: "100%", justifyContent: "space-between" }}>
          <Space>
            <span style={{ fontWeight: 600 }}>{t("parentFees.dateRange")}</span>
            <DatePicker.RangePicker
              value={range as any}
              onChange={(values) => {
                if (values && values[0] && values[1]) setRange([values[0], values[1]]);
                else setRange(null);
              }}
            />
          </Space>
          <Button onClick={() => setRange(null)}>{t("parentFees.reset")}</Button>
        </Space>
      </Card>

      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={8}>
          <Card><Statistic title={t("parentFees.paidTotal")} value={formatEGP(paid)} prefix={<DollarOutlined />} valueStyle={{ color: "#22c55f" }} /></Card>
        </Col>
        <Col xs={24} sm={12} lg={8}>
          <Card><Statistic title={t("parentFees.refunds")} value={formatEGP(refunds)} prefix={<BellOutlined />} valueStyle={{ color: "#f97315" }} /></Card>
        </Col>
        <Col xs={24} sm={12} lg={8}>
          <Card><Statistic title={t("parentFees.netPaid")} value={formatEGP(net)} prefix={<BarChartOutlined />} valueStyle={{ color: "#0fa5e9" }} /></Card>
        </Col>
      </Row>

      <Card title={t("parentFees.paymentHistory")}>
        <Card size="small" title={t("parentFees.paymentTimeline")} style={{ marginBottom: 16 }}>
          <LineChart
            series={paymentSeries}
            showArea
            yValueFormatter={(value) => formatShortEGP(value)}
            emptyText={t("parentFees.noTimeline")}
          />
        </Card>
        <Table
          dataSource={childPayments}
          columns={columns}
          rowKey={(r, i) => r._id || i}
          pagination={{ pageSize: 10 }}
          locale={{ emptyText: t("parentFees.noPayments") }}
          size="small"
        />
      </Card>
    </Space>
  );
}
