"use client";

import React from "react";
import { useCustom } from "@refinedev/core";
import { Card, Statistic, Table, Tag, Progress, Row, Col, Space } from "antd";
import { CheckCircleOutlined, FileTextOutlined, TrophyOutlined, MessageOutlined, CalendarOutlined } from "@ant-design/icons";
import { BarChart, LineChart } from "@/components/charts";
import { assignmentsTrendBarData, studentGradeTrendLineSeries } from "@/lib/analytics/transforms";
import { useI18n } from "@/components/providers/I18nProvider";
import { PageSkeleton } from "@/components/shared/Skeletons";


export function StudentDashboard() {
  const { t } = useI18n();
  const { query, result } = useCustom({ url: "dashboards/student", method: "get" });
  const data = (result?.data as any) ?? {};

  if (query.isLoading && !result?.data) {
    return <PageSkeleton />;
  }

  const scheduleColumns = [
    { title: t("studentDashboard.time"), dataIndex: "time", key: "time" },
    { title: t("studentDashboard.subject"), dataIndex: "subject", key: "subject" },
    { title: t("studentDashboard.room"), dataIndex: "room", key: "room" },
    { title: t("studentDashboard.teacher"), dataIndex: "teacher", key: "teacher" },
  ];

  const dueColumns = [
    { title: t("studentDashboard.assignment"), dataIndex: "title", key: "title" },
    { title: t("studentDashboard.subject"), dataIndex: "subject", key: "subject" },
    {
      title: t("studentDashboard.due"),
      key: "due",
      render: (_: any, r: any) => <Tag color={r.urgent ? "red" : "default"}>{r.due}</Tag>,
    },
  ];

  return (
    <Space direction="vertical" size="middle" style={{ width: "100%" }}>
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={6}>
          <Card><Statistic title={t("studentDashboard.attendanceRate")} value={`${data.attendanceRate ?? 0}%`} prefix={<CheckCircleOutlined />} /></Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card><Statistic title={t("studentDashboard.assignmentsDue")} value={data.assignmentsDue ?? 0} prefix={<FileTextOutlined />} /></Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card><Statistic title={t("studentDashboard.averageGrade")} value={data.averageGrade ?? "—"} prefix={<TrophyOutlined />} /></Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card><Statistic title={t("studentDashboard.unreadMessages")} value={data.unreadMessages ?? 0} prefix={<MessageOutlined />} /></Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={16}>
          <Card title={t("studentDashboard.todaySchedule")}>
            <Table
              dataSource={data.todaySchedule || []}
              columns={scheduleColumns}
              rowKey={(r: any) => r.id}
              pagination={false}
              size="small"
              locale={{ emptyText: t("studentDashboard.noClassesToday") }}
            />
          </Card>
        </Col>
        <Col xs={24} lg={8}>
          <Card title={t("studentDashboard.dueSoon")}>
            <Table
              dataSource={data.dueSoon || []}
              columns={dueColumns}
              rowKey={(r: any) => r.id}
              pagination={false}
              size="small"
              locale={{ emptyText: t("studentDashboard.noUpcomingAssignments") }}
            />
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 12, color: "#888", marginBottom: 8 }}>{t("studentDashboard.overallCompletion")}</div>
              <Progress percent={data.overallCompletion || 0} />
              <div style={{ fontSize: 12, color: "#888" }}>{data.overallCompletion}% {t("studentDashboard.thisSemester")}</div>
            </div>
          </Card>
        </Col>
      </Row>

      <Card title={t("studentDashboard.subjectPerformance")}>
        {(data.subjectPerformance || []).length === 0 ? (
          <div style={{ textAlign: "center", padding: 24, color: "#888" }}>{t("studentDashboard.noPerformanceData")}</div>
        ) : (
          <Row gutter={[16, 16]}>
            {(data.subjectPerformance || []).map((s: any, i: number) => (
              <Col xs={12} sm={8} md={5} key={s.id || i}>
                <Card size="small">
                  <div style={{ fontSize: 24, fontWeight: 700, color: "#0fa5e9" }}>{s.grade}</div>
                  <div style={{ fontWeight: 600, marginTop: 4 }}>{s.subject}</div>
                  <Progress percent={s.percentage} size="small" showInfo={false} />
                  <div style={{ fontSize: 12, color: "#0fa5e9" }}>{s.percentage}%</div>
                </Card>
              </Col>
            ))}
          </Row>
        )}
      </Card>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={14}>
          <Card title={t("studentDashboard.gradeTrend")}>
            <LineChart
              series={studentGradeTrendLineSeries(data.analytics?.gradeTrend ?? [])}
              showArea
              yValueFormatter={(value) => `${Math.round(value)}%`}
              emptyText={t("studentDashboard.noGradeTrend")}
            />
          </Card>
        </Col>
        <Col xs={24} lg={10}>
          <Card title={t("studentDashboard.assignmentProgressTrend")}>
            <BarChart
              data={assignmentsTrendBarData(data.analytics?.assignmentsTrend ?? [])}
              series={[
                { key: "pending", label: t("studentDashboard.pending"), color: "#f97315" },
                { key: "graded", label: t("studentDashboard.graded"), color: "#22c55f" },
              ]}
              stacked
              emptyText={t("studentDashboard.noAssignmentTrend")}
            />
          </Card>
        </Col>
      </Row>
    </Space>
  );
}
