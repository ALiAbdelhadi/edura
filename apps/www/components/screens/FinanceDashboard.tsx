"use client";

import React from "react";
import { useCustom } from "@refinedev/core";
import { Card, Statistic, Row, Col, Space, Typography, Alert, theme } from "antd";
import { DollarOutlined, RiseOutlined, FallOutlined, WalletOutlined, FileDoneOutlined } from "@ant-design/icons";
import { LineChart } from "@/components/charts";
import { useI18n } from "@/components/providers/I18nProvider";
import { StatCardsSkeleton } from "@/components/shared/Skeletons";

type FinanceKpis = {
  platformCommission: number;
  grossLessonRevenue: number;
  totalRefunds: number;
  pendingPayouts: { count: number; amount: number };
  totalExpenses: number;
};
type AlertsResp = { alerts: { level: "info" | "warning"; code: string; message: string; value?: number }[] };
type RevenueResp = { period: string; series: { period: string; grossRevenue: number; platformCommission: number; payouts: number; refunds: number }[] };

export function FinanceDashboard() {
  const { t, formatShortEGP, formatNumber } = useI18n();
  const { token } = theme.useToken();

  const { query: kq, result: kpis } = useCustom<FinanceKpis>({ url: "finance/dashboard", method: "get" });
  const { result: alertsRes } = useCustom<AlertsResp>({ url: "finance/alerts", method: "get" });
  const { result: rev } = useCustom<RevenueResp>({ url: "finance/reports/revenue", method: "get", config: { query: { period: "monthly" } } });

  const k = kpis?.data;
  const alerts = alertsRes?.data?.alerts ?? [];
  const series = rev?.data?.series ?? [];

  if (kq.isLoading) {
    return (
      <Space direction="vertical" size="large" style={{ width: "100%" }}>
        <StatCardsSkeleton count={5} />
      </Space>
    );
  }

  const stat = (title: string, value: React.ReactNode, icon: React.ReactNode, color: string, extra?: React.ReactNode) => (
    <Card size="small" styles={{ body: { padding: 20 } }}>
      <Space align="start" style={{ justifyContent: "space-between", width: "100%" }}>
        <div>
          <Statistic title={title} value={value as number} valueStyle={{ fontVariantNumeric: "tabular-nums" }} />
          {extra}
        </div>
        <span aria-hidden style={{ display: "inline-flex", padding: 8, borderRadius: 10, background: color + "1a", color, fontSize: 18 }}>
          {icon}
        </span>
      </Space>
    </Card>
  );

  return (
    <Space direction="vertical" size="large" style={{ width: "100%" }}>
      {alerts.length > 0 && (
        <Space direction="vertical" size="small" style={{ width: "100%" }}>
          {alerts.map((a) => (
            <Alert
              key={a.code}
              type={a.level === "warning" ? "warning" : "info"}
              showIcon
              message={a.message}
              role="status"
            />
          ))}
        </Space>
      )}

      <Row gutter={[16, 16]}>
        <Col xs={12} md={8} lg={5}>{stat("Platform commission", formatShortEGP(k?.platformCommission), <DollarOutlined />, "#16a34a")}</Col>
        <Col xs={12} md={8} lg={5}>{stat("Gross revenue", formatShortEGP(k?.grossLessonRevenue), <RiseOutlined />, "#0284c7")}</Col>
        <Col xs={12} md={8} lg={5}>{stat("Refunds", formatShortEGP(k?.totalRefunds), <FallOutlined />, "#ef4444")}</Col>
        <Col xs={12} md={8} lg={5}>
          {stat(
            t("nav.payouts"),
            formatShortEGP(k?.pendingPayouts.amount),
            <WalletOutlined />,
            "#f59e0b",
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {formatNumber(k?.pendingPayouts.count)} {t("status.pending") === "status.pending" ? "pending" : t("status.pending")}
            </Typography.Text>,
          )}
        </Col>
        <Col xs={12} md={8} lg={4}>{stat(t("nav.expenses"), formatShortEGP(k?.totalExpenses), <FileDoneOutlined />, "#6b7280")}</Col>
      </Row>

      <Card title={t("nav.reports") === "nav.reports" ? "Revenue vs commission" : t("nav.reports")}>
        {series.length > 0 ? (
          <LineChart
            series={[
              { id: "gross", label: "Gross revenue", color: token.colorPrimary, points: series.map((p) => ({ x: p.period.slice(5), value: Math.round(p.grossRevenue / 100) })) },
              { id: "commission", label: "Commission", color: "#16a34a", points: series.map((p) => ({ x: p.period.slice(5), value: Math.round(p.platformCommission / 100) })) },
            ]}
            height={280}
            yValueFormatter={(v) => formatShortEGP(v * 100)}
          />
        ) : (
          <Typography.Text type="secondary">{t("common.noData") === "common.noData" ? "No revenue yet" : t("common.noData")}</Typography.Text>
        )}
      </Card>
    </Space>
  );
}
