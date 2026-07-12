"use client";

import React from "react";
import { useList, useCustom } from "@refinedev/core";
import { Card, Statistic, Tag, Row, Col, Space } from "antd";
import { CheckCircleOutlined, TrophyOutlined, DollarOutlined, BellOutlined } from "@ant-design/icons";
import { LineChart, ProgressArcChart } from "@/components/charts";
import { useChildSelector, ChildSelectorBar } from "@/components/shared/ChildSelector";
import { useI18n } from "@/components/providers/I18nProvider";

export function ParentDashboard() {
  const { t, formatEGP, formatDate } = useI18n();
  const { childId, isLoading: childrenLoading } = useChildSelector();

  const { query: gradesQuery, result: gradesResult } = useList({
    resource: "grades",
    filters: childId ? [{ field: "studentId", operator: "eq", value: childId }] : undefined,
    queryOptions: { enabled: !!childId },
  });

  const { query: paymentsQuery, result: paymentsResult } = useList({
    resource: "payments",
    filters: childId ? [{ field: "studentId", operator: "eq", value: childId }] : undefined,
    queryOptions: { enabled: !!childId },
  });

  const { query: enrollmentsQuery, result: enrollmentsResult } = useList({
    resource: "enrollments",
    filters: childId
      ? [
          { field: "studentId", operator: "eq", value: childId },
          { field: "status", operator: "eq", value: "active" },
        ]
      : undefined,
    queryOptions: { enabled: !!childId },
  });

  const { query: attendanceQuery, result: attendanceResult } = useCustom({
    url: "me/attendance",
    method: "get",
    config: { query: childId ? { studentId: childId } : undefined },
    queryOptions: { enabled: !!childId },
  });

  const grades = (gradesResult?.data ?? []) as any[];
  const payments = (paymentsResult?.data ?? []) as any[];
  const enrollments = (enrollmentsResult?.data ?? []) as any[];
  const attendance = (attendanceResult?.data as any) || null;

  const isLoading = childrenLoading || gradesQuery.isLoading || paymentsQuery.isLoading || enrollmentsQuery.isLoading || attendanceQuery.isLoading;

  const courseMap = new Map<string, { scores: { score: number; max: number }[] }>();
  for (const g of grades) {
    if (!courseMap.has(g.courseId)) courseMap.set(g.courseId, { scores: [] });
    const myScore = g.scores?.[0];
    if (myScore) courseMap.get(g.courseId)!.scores.push({ score: myScore.score, max: g.maxScore });
  }

  let overallAvg = 0;
  if (courseMap.size > 0) {
    let totalPct = 0;
    for (const [, data] of courseMap) {
      const totalScore = data.scores.reduce((a, b) => a + b.score, 0);
      const totalMax = data.scores.reduce((a, b) => a + b.max, 0);
      totalPct += totalMax > 0 ? (totalScore / totalMax) * 100 : 0;
    }
    overallAvg = Math.round(totalPct / courseMap.size);
  }

  const netPaid = payments.reduce((a: number, b: any) => a + (b.amount ?? 0), 0);
  const paid = payments.filter((p: any) => p.amount > 0).reduce((a: number, b: any) => a + b.amount, 0);
  const owed = enrollments.reduce((a: number, b: any) => a + (b.coursePrice ?? 0), 0);
  const pendingAmount = Math.max(owed - netPaid, 0);

  const recentGrades = grades.slice(-3);
  const recentPayments = payments.slice(-3);

  const attendanceTrend = React.useMemo(() => {
    const records = (attendance?.records ?? []) as Array<{ date: string; status: "present" | "absent" | "late" }>;
    const byDay = records
      .slice(-14)
      .map((record) => ({
        x: formatDate(`${record.date}T00:00:00`, { month: "short", day: "numeric" }),
        value: record.status === "present" ? 100 : record.status === "late" ? 60 : 0,
      }));
    return [{ id: "attendance", label: t("parentDashboard.attendanceLabel"), color: "#22c55f", points: byDay }];
  }, [attendance, t, formatDate]);

  const gradeTrend = React.useMemo(() => {
    const ordered = [...grades]
      .filter((g: any) => g.date)
      .sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .slice(-12)
      .map((grade: any) => {
        const score = grade.scores?.[0];
        const value = score ? Math.round((score.score / (grade.maxScore || 1)) * 100) : 0;
        return {
          x: formatDate(grade.date, { month: "short", day: "numeric" }),
          value,
        };
      });
    return [{ id: "grades", label: t("parentDashboard.gradePercentLabel"), color: "#0fa5e9", points: ordered }];
  }, [grades, t, formatDate]);

  const totalFees = paid + pendingAmount;
  const paidRatio = totalFees > 0 ? (paid / totalFees) * 100 : 0;

  if (isLoading) {
    return <div style={{ textAlign: "center", padding: 40, color: "#888" }}>{t("parentDashboard.loadingDashboard")}</div>;
  }

  if (!childId) {
    return <div style={{ textAlign: "center", padding: 40, color: "#888" }}>{t("parentDashboard.noChildren")}</div>;
  }

  return (
    <Space direction="vertical" size="middle" style={{ width: "100%" }}>
      <ChildSelectorBar />

      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={6}>
          <Card><Statistic title={t("parentDashboard.attendanceRate")} value={`${attendance?.rate ?? 0}%`} prefix={<CheckCircleOutlined />} /></Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card><Statistic title={t("parentDashboard.averageGrade")} value={`${overallAvg}%`} prefix={<TrophyOutlined />} /></Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card><Statistic title={t("parentDashboard.feesPaid")} value={formatEGP(paid)} prefix={<DollarOutlined />} valueStyle={{ color: "#22c55f" }} /></Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card><Statistic title={t("parentDashboard.feesDue")} value={formatEGP(pendingAmount)} prefix={<BellOutlined />} valueStyle={{ color: "#cf1322" }} /></Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={12}>
          <Card title={t("parentDashboard.recentGrades")}>
            {recentGrades.length === 0 ? (
              <div style={{ textAlign: "center", padding: 24, color: "#888" }}>{t("parentDashboard.noGrades")}</div>
            ) : (
              <Space direction="vertical" style={{ width: "100%" }}>
                {recentGrades.map((g: any, i: number) => {
                  const myScore = g.scores?.[0];
                  const pct = myScore ? Math.round((myScore.score / g.maxScore) * 100) : 0;
                  return (
                    <div key={g._id || i} style={{ padding: "8px 0", borderBottom: "1px solid #f0f0f0", display: "flex", justifyContent: "space-between" }}>
                      <div>
                        <div style={{ fontWeight: 600 }}>{g.name}</div>
                        <div style={{ fontSize: 12, color: "#888" }}>{g.subject || g.courseName || ""}</div>
                      </div>
                      <Tag color={pct >= 90 ? "green" : pct >= 75 ? "blue" : "orange"}>{pct}%</Tag>
                    </div>
                  );
                })}
              </Space>
            )}
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card title={t("parentDashboard.recentPayments")}>
            {recentPayments.length === 0 ? (
              <div style={{ textAlign: "center", padding: 24, color: "#888" }}>{t("parentDashboard.noPayments")}</div>
            ) : (
              <Space direction="vertical" style={{ width: "100%" }}>
                {recentPayments.map((p: any, i: number) => {
                  const isRefund = p.amount < 0;
                  return (
                    <div key={p._id || i} style={{ padding: "8px 0", borderBottom: "1px solid #f0f0f0", display: "flex", justifyContent: "space-between" }}>
                      <div>
                        <div style={{ fontWeight: 600 }}>{p.courseName ?? t("parentDashboard.payment")}</div>
                        <div style={{ fontSize: 12, color: "#888" }}>{p.paidAt ? formatDate(p.paidAt) : "—"}</div>
                      </div>
                      <span style={{ color: isRefund ? "#f97315" : "#22c55f", fontWeight: 600 }}>
                        {isRefund ? "−" : ""}{formatEGP(Math.abs(p.amount))}
                      </span>
                    </div>
                  );
                })}
              </Space>
            )}
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={8}>
          <Card title={t("parentDashboard.paidVsDue")}>
            <ProgressArcChart
              percent={paidRatio}
              color="#22c55f"
              label={t("parentDashboard.paidCoverage")}
              subLabel={`${formatEGP(paid)} ${t("parentDashboard.paidLabel")} / ${formatEGP(pendingAmount)} ${t("parentDashboard.dueLabel")}`}
            />
          </Card>
        </Col>
        <Col xs={24} lg={8}>
          <Card title={t("parentDashboard.attendanceTrend")}>
            <LineChart
              series={attendanceTrend}
              showArea
              yValueFormatter={(value) => `${Math.round(value)}%`}
              emptyText={t("parentDashboard.noAttendanceTrend")}
            />
          </Card>
        </Col>
        <Col xs={24} lg={8}>
          <Card title={t("parentDashboard.gradeTrend")}>
            <LineChart
              series={gradeTrend}
              showArea
              yValueFormatter={(value) => `${Math.round(value)}%`}
              emptyText={t("parentDashboard.noGradeTrend")}
            />
          </Card>
        </Col>
      </Row>
    </Space>
  );
}
