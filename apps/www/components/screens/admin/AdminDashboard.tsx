"use client";

import React from "react";
import { useCustom } from "@refinedev/core";
import { Card, Statistic, Row, Col, Space, Progress } from "antd";
import {
  TeamOutlined,
  UserOutlined,
  BookOutlined,
  DollarOutlined,
} from "@ant-design/icons";
import { BarChart, DonutChart, LineChart } from "@/components/charts";
import { revenueVsExpensesLineSeries, sessionStatusDonutData } from "@/lib/analytics/transforms";
import { useI18n } from "@/components/providers/I18nProvider";
import { PageSkeleton } from "@/components/shared/Skeletons";

interface DashboardData {
  totals: {
    students: number;
    teachers: number;
    activeCourses: number;
    revenue: number;
  };
  attendanceRate: number;
  todaySessions: any[];
  feeDefaulters: number;
  pendingEnrollmentRequests: number;
  analytics?: {
    revenueVsExpenses?: Array<{ label: string; revenue: number; expenses: number; netProfit: number }>;
    sessionStatusMix?: Array<{ status: "scheduled" | "completed" | "cancelled" | "postponed"; count: number }>;
    attendanceByCourse?: Array<{ title: string; attendanceRatePct: number }>;
  };
}

export function AdminDashboard() {
  const { t, formatEGP, formatShortEGP } = useI18n();
  const { query, result } = useCustom<DashboardData>({
    url: "dashboards/admin",
    method: "get",
  });

  const d = result?.data as DashboardData | undefined;

  if (query.isLoading) {
    return <PageSkeleton />;
  }

  const totals = d?.totals ?? { students: 0, teachers: 0, activeCourses: 0, revenue: 0 };
  const attendanceRate = d?.attendanceRate ?? 0;
  const activeSessions = d?.todaySessions?.length ?? 0;
  const feeDefaulters = d?.feeDefaulters ?? 0;
  const pendingRequests = d?.pendingEnrollmentRequests ?? 0;

  return (
    <Space direction="vertical" size="large" style={{ width: "100%" }}>
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title={t("adminHome.dashboard_totalStudents")}
              value={totals.students}
              prefix={<TeamOutlined style={{ color: "#0fa5e9" }} />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title={t("nav.teachers")}
              value={totals.teachers}
              prefix={<UserOutlined style={{ color: "#177674" }} />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title={t("adminHome.dashboard_activeClasses")}
              value={totals.activeCourses}
              prefix={<BookOutlined style={{ color: "#f97315" }} />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title={t("adminHome.dashboard_totalRevenue")}
              value={formatEGP(totals.revenue)}
              prefix={<DollarOutlined style={{ color: "#22c55f" }} />}
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} md={14}>
          <Card title={t("adminHome.dashboard_todaysSnapshot")}>
            <Row gutter={[16, 16]}>
              <Col span={12}>
                <Statistic title={t("adminHome.dashboard_attendanceRate")} value={attendanceRate} suffix="%" />
                <Progress percent={attendanceRate} showInfo={false} strokeColor="#22c55f" />
              </Col>
              <Col span={12}>
                <Statistic title={t("adminHome.dashboard_activeSessions")} value={activeSessions} />
              </Col>
            </Row>
          </Card>
        </Col>
        <Col xs={24} md={10}>
          <Card title={t("adminHome.dashboard_pendingActions")}>
            <Space direction="vertical" style={{ width: "100%" }}>
              {[
                { label: t("adminHome.dashboard_feeDefaulters"), count: feeDefaulters },
                { label: t("adminHome.dashboard_pendingEnrollmentRequests"), count: pendingRequests },
              ].map((item, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    padding: "8px 0",
                    borderBottom: "1px solid #f0f0f0",
                  }}
                >
                  <span>{item.label}</span>
                  <span style={{ fontWeight: 600 }}>{item.count}</span>
                </div>
              ))}
            </Space>
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={16}>
          <Card title={t("adminHome.dashboard_revenueVsExpensesTrend")}>
            <LineChart
              series={revenueVsExpensesLineSeries(
                (d?.analytics?.revenueVsExpenses ?? []).map((entry) => ({
                  period: entry.label,
                  label: entry.label,
                  revenue: entry.revenue,
                  expenses: entry.expenses,
                  netProfit: entry.netProfit,
                })),
              )}
              showArea
              yValueFormatter={(value) => formatShortEGP(value)}
              emptyText={t("adminHome.dashboard_noFinancialTrend")}
            />
          </Card>
        </Col>
        <Col xs={24} lg={8}>
          <Card title={t("adminHome.dashboard_sessionStatusMix")}>
            <DonutChart
              data={sessionStatusDonutData(d?.analytics?.sessionStatusMix ?? [])}
              centerLabel={t("nav.sessions")}
              emptyText={t("adminHome.dashboard_noSessionStatus")}
            />
          </Card>
        </Col>
      </Row>

      <Card title={t("adminHome.dashboard_attendanceByCourse")}>
        <BarChart
          data={(d?.analytics?.attendanceByCourse ?? []).map((entry) => ({
            label: entry.title,
            rate: entry.attendanceRatePct,
          }))}
          series={[{ key: "rate", label: t("adminHome.dashboard_attendancePercent"), color: "#22c55f" }]}
          horizontal
          yValueFormatter={(value) => `${Math.round(value)}%`}
          emptyText={t("adminHome.dashboard_noCourseAttendance")}
        />
      </Card>
    </Space>
  );
}
