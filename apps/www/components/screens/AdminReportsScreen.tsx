"use client";

import React from "react";
import { useCustom } from "@refinedev/core";
import { Card, Statistic, Row, Col, Space, DatePicker, Segmented, Button } from "antd";
import type { Dayjs } from "dayjs";
import { DollarOutlined, FileTextOutlined, BarChartOutlined, CheckCircleOutlined } from "@ant-design/icons";
import { BarChart, DonutChart } from "@/components/charts";
import {
  enrollmentFunnelBarData,
  sessionStatusDonutData,
} from "@/lib/analytics/transforms";
import { useI18n } from "@/components/providers/I18nProvider";

const CHART_COLORS = ["#0fa5e9", "#8b5cf6", "#177674", "#f97315", "#22c55f", "#ed4899", "#600000"];

export function AdminReportsScreen() {
  const { t, formatShortEGP } = useI18n();
  const fmtEGP = formatShortEGP;
  const [range, setRange] = React.useState<[Dayjs, Dayjs] | null>(null);
  const [granularity, setGranularity] = React.useState<"week" | "month">("month");

  const queryValues = React.useMemo(
    () => ({
      ...(range?.[0] ? { from: range[0].format("YYYY-MM-DD") } : {}),
      ...(range?.[1] ? { to: range[1].format("YYYY-MM-DD") } : {}),
      granularity,
    }),
    [range, granularity],
  );

  const { query, result } = useCustom({
    url: "reports/net-profit",
    method: "get",
    config: { query: queryValues },
  });
  const { query: trendQuery, result: trendResult } = useCustom({
    url: "reports/revenue-timeseries",
    method: "get",
    config: { query: queryValues },
  });
  const { query: expensesQuery, result: expensesTimeseriesResult } = useCustom({
    url: "reports/expenses-timeseries",
    method: "get",
    config: { query: queryValues },
  });
  const { result: fillRateResult } = useCustom({
    url: "reports/course-fill-rates",
    method: "get",
    config: { query: queryValues },
  });
  const { result: funnelResult } = useCustom({ url: "reports/enrollment-funnel", method: "get", config: { query: queryValues } });
  const data = (result?.data as any) || null;
  const trendData = ((trendResult?.data as any)?.series ?? []) as any[];
  const expensesByCategory = ((expensesTimeseriesResult?.data as any)?.byCategory ?? []) as any[];
  const fillRates = ((fillRateResult?.data as any)?.items ?? []) as any[];
  const funnel = ((funnelResult?.data as any)?.items ?? []) as any[];

  if ((query.isLoading || trendQuery.isLoading || expensesQuery.isLoading) && !result?.data) {
    return <div style={{ textAlign: "center", padding: 40, color: "#888" }}>{t("adminManage.reports.loadingReports")}</div>;
  }

  if (query.isError && !data) {
    return <div style={{ textAlign: "center", padding: 40, color: "red" }}>{t("adminManage.reports.loadFailed")}</div>;
  }

  const revenue = data?.revenue ?? 0;
  const expenses = data?.expenses ?? 0;
  const netProfit = data?.netProfit ?? 0;
  const margin = revenue > 0 ? ((netProfit / revenue) * 100).toFixed(1) : "0";
  const byCourse = data?.byCourse ?? [];
  const enrollmentRates = fillRates.length > 0 ? fillRates : data?.enrollmentRates ?? [];
  const sessionStatusMix = data?.sessionStatusMix ?? [];

  const expenseDonut = expensesByCategory.map((entry, index) => ({
    id: entry._id,
    label: entry._id,
    value: entry.subtotal ?? 0,
    color: CHART_COLORS[index % CHART_COLORS.length],
  }));

  return (
    <Space direction="vertical" size="middle" style={{ width: "100%" }}>
      <Card size="small">
        <Space wrap style={{ width: "100%", justifyContent: "space-between" }}>
          <Space wrap>
            <span style={{ fontWeight: 600 }}>{t("adminManage.reports.dateRange")}</span>
            <DatePicker.RangePicker
              value={range as any}
              onChange={(values) => {
                if (values && values[0] && values[1]) setRange([values[0], values[1]]);
                else setRange(null);
              }}
            />
          </Space>
          <Space wrap>
            <span style={{ fontWeight: 600 }}>{t("adminManage.reports.granularity")}</span>
            <Segmented
              options={[
                { label: t("adminManage.reports.monthly"), value: "month" },
                { label: t("adminManage.reports.weekly"), value: "week" },
              ]}
              value={granularity}
              onChange={(value) => setGranularity(value as "week" | "month")}
            />
            <Button onClick={() => setRange(null)}>{t("adminManage.reports.reset")}</Button>
          </Space>
        </Space>
      </Card>

      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={6}>
          <Card><Statistic title={t("common.revenue")} value={fmtEGP(revenue)} prefix={<DollarOutlined />} valueStyle={{ color: "#22c55f" }} /></Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card><Statistic title={t("common.expenses")} value={fmtEGP(expenses)} prefix={<FileTextOutlined />} valueStyle={{ color: "#f97315" }} /></Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card><Statistic title={t("adminManage.reports.netProfit")} value={fmtEGP(netProfit)} prefix={<BarChartOutlined />} valueStyle={{ color: "#0fa5e9" }} suffix={`${margin}% ${t("adminManage.reports.margin")}`} /></Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card><Statistic title={t("adminManage.reports.attendanceRate")} value={`${data?.attendanceRate ?? 0}%`} prefix={<CheckCircleOutlined />} /></Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={16}>
          <Card title={`${t("adminManage.reports.cashflow")} (${granularity === "month" ? t("adminManage.reports.monthly") : t("adminManage.reports.weekly")})`}>
            <BarChart
              data={trendData.map((entry) => ({
                label: entry.label,
                revenue: entry.revenue,
                expenses: entry.expenses,
              }))}
              series={[
                { key: "revenue", label: t("common.revenue"), color: "#0fa5e9" },
                { key: "expenses", label: t("common.expenses"), color: "#f97315" },
              ]}
              yValueFormatter={(value) => fmtEGP(value)}
              emptyText={t("adminManage.reports.noCashflow")}
            />
          </Card>
        </Col>
        <Col xs={24} lg={8}>
          <Card title={t("adminManage.reports.expenseCategories")}>
            <DonutChart data={expenseDonut} centerLabel={t("common.expenses")} emptyText={t("adminManage.reports.noExpenseBreakdown")} />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} md={12}>
          <Card title={t("adminManage.reports.revenueByCourse")}>
            <BarChart
              data={byCourse.slice(0, 8).map((entry: any) => ({
                label: entry.title,
                revenue: entry.revenue,
              }))}
              series={[{ key: "revenue", label: t("common.revenue"), color: "#0fa5e9" }]}
              horizontal
              yValueFormatter={(value) => fmtEGP(value)}
              emptyText={t("adminManage.reports.noRevenueByCourse")}
            />
          </Card>
        </Col>
        <Col xs={24} md={12}>
          <Card title={t("adminManage.reports.enrollmentRate")}>
            <BarChart
              data={enrollmentRates.slice(0, 8).map((entry: any) => ({
                label: entry.title,
                fillRate: entry.fillRatePct ?? entry.pct,
              }))}
              series={[{ key: "fillRate", label: t("adminManage.reports.fillRatePct"), color: "#22c55f" }]}
              horizontal
              yValueFormatter={(value) => `${Math.round(value)}%`}
              emptyText={t("adminManage.reports.noEnrollmentRate")}
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} md={12}>
          <Card title={t("adminManage.reports.enrollmentFunnel")}>
            <BarChart
              data={enrollmentFunnelBarData(funnel)}
              series={[{ key: "count", label: t("adminManage.reports.requests"), color: "#8b5cf6" }]}
              emptyText={t("adminManage.reports.noEnrollmentRequests")}
            />
          </Card>
        </Col>
        <Col xs={24} md={12}>
          <Card title={t("adminManage.reports.sessionStatus")}>
            <DonutChart data={sessionStatusDonutData(sessionStatusMix)} centerLabel={t("adminManage.reports.sessions")} />
          </Card>
        </Col>
      </Row>
    </Space>
  );
}
