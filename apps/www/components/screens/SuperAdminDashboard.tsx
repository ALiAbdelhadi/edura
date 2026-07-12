"use client";

import React from "react";
import { useCustom } from "@refinedev/core";
import Link from "next/link";
import { Card, Statistic, Row, Col, Space, Typography, Button, Badge, theme } from "antd";
import {
  BankOutlined,
  TeamOutlined,
  UserOutlined,
  DollarOutlined,
  ClockCircleOutlined,
  RiseOutlined,
} from "@ant-design/icons";
import { LineChart } from "@/components/charts";
import { useI18n } from "@/components/providers/I18nProvider";
import { StatCardsSkeleton } from "@/components/shared/Skeletons";

type Kpis = {
  centers: { active: number; pending: number };
  users: { teachers: number; students: number; parents: number };
  pendingRegistrations: number;
  platformRevenue: number;
  grossLessonRevenue: number;
  lessonsCompleted: number;
};
type RevenuePoint = { period: string; value: number };

export function SuperAdminDashboard() {
  const { t, formatShortEGP, formatNumber } = useI18n();
  const { token } = theme.useToken();

  const { query: kq, result: kpis } = useCustom<Kpis>({ url: "admin/dashboard/kpis", method: "get" });
  const { result: rev } = useCustom<{ period: string; series: RevenuePoint[] }>({
    url: "admin/dashboard/revenue-chart",
    method: "get",
    config: { query: { period: "monthly" } },
  });

  const k = kpis?.data;
  const series = rev?.data?.series ?? [];

  if (kq.isLoading) {
    return (
      <Space direction="vertical" size="large" style={{ width: "100%" }}>
        <StatCardsSkeleton count={4} />
        <StatCardsSkeleton count={3} />
      </Space>
    );
  }

  const stat = (title: string, value: React.ReactNode, icon: React.ReactNode, color: string) => (
    <Card size="small" styles={{ body: { padding: 20 } }}>
      <Space align="start" style={{ justifyContent: "space-between", width: "100%" }}>
        <Statistic title={title} value={value as number} valueStyle={{ fontVariantNumeric: "tabular-nums" }} />
        <span
          aria-hidden
          style={{
            display: "inline-flex",
            padding: 8,
            borderRadius: 10,
            background: color + "1a",
            color,
            fontSize: 18,
          }}
        >
          {icon}
        </span>
      </Space>
    </Card>
  );

  return (
    <Space direction="vertical" size="large" style={{ width: "100%" }}>
      {/* Pending registrations call-to-action */}
      {(k?.pendingRegistrations ?? 0) > 0 && (
        <Card
          styles={{ body: { padding: 16 } }}
          style={{ borderColor: token.colorWarningBorder, background: token.colorWarningBg }}
        >
          <Space style={{ justifyContent: "space-between", width: "100%" }} wrap>
            <Space>
              <ClockCircleOutlined style={{ color: token.colorWarning }} aria-hidden />
              <Typography.Text strong>
                {formatNumber(k?.pendingRegistrations)} {t("nav.registrations")} — {t("common.pending") === "common.pending" ? "awaiting review" : t("common.pending")}
              </Typography.Text>
            </Space>
            <Link href="/dashboard/superadmin/registrations">
              <Button type="primary">{t("actions.review") === "actions.review" ? "Review" : t("actions.review")}</Button>
            </Link>
          </Space>
        </Card>
      )}

      <Row gutter={[16, 16]}>
        <Col xs={12} md={6}>{stat(t("nav.centers"), k?.centers.active ?? 0, <BankOutlined />, "#0284c7")}</Col>
        <Col xs={12} md={6}>{stat(t("nav.teachers"), k?.users.teachers ?? 0, <UserOutlined />, "#7c3aed")}</Col>
        <Col xs={12} md={6}>{stat(t("nav.students"), k?.users.students ?? 0, <TeamOutlined />, "#0891b2")}</Col>
        <Col xs={12} md={6}>
          <Badge dot={(k?.pendingRegistrations ?? 0) > 0} offset={[-6, 6]} style={{ width: "100%" }}>
            {stat(t("nav.registrations"), k?.pendingRegistrations ?? 0, <ClockCircleOutlined />, "#f59e0b")}
          </Badge>
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={12} md={8}>{stat(t("adminHome.dashboard_revenue") === "adminHome.dashboard_revenue" ? "Platform revenue" : t("adminHome.dashboard_revenue"), formatShortEGP(k?.platformRevenue), <DollarOutlined />, "#16a34a")}</Col>
        <Col xs={12} md={8}>{stat("Gross lesson revenue", formatShortEGP(k?.grossLessonRevenue), <RiseOutlined />, "#0284c7")}</Col>
        <Col xs={12} md={8}>{stat("Lessons completed", k?.lessonsCompleted ?? 0, <BankOutlined />, "#6b7280")}</Col>
      </Row>

      <Card title={t("nav.reports") === "nav.reports" ? "Platform revenue" : t("nav.reports")}>
        {series.length > 0 ? (
          <LineChart
            series={[
              {
                id: "platform-revenue",
                label: t("nav.reports") === "nav.reports" ? "Platform revenue (EGP)" : t("nav.reports"),
                color: token.colorPrimary,
                points: series.map((p) => ({ x: p.period.slice(5), value: Math.round(p.value / 100) })),
              },
            ]}
            height={260}
            yValueFormatter={(v) => formatShortEGP(v * 100)}
          />
        ) : (
          <Typography.Text type="secondary">{t("common.noData") === "common.noData" ? "No revenue yet" : t("common.noData")}</Typography.Text>
        )}
      </Card>
    </Space>
  );
}
