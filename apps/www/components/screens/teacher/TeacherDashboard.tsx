"use client";

import React from "react";
import { useCustom } from "@refinedev/core";
import { Card, Statistic, Table, Tag, Row, Col, Space } from "antd";
import { CalendarOutlined, FileTextOutlined, TeamOutlined, CheckCircleOutlined } from "@ant-design/icons";
import { BarChart, LineChart } from "@/components/charts";
import { scoreDistributionBarData, teacherAttendanceLineSeries, teacherGradeLoadBarData } from "@/lib/analytics/transforms";
import { useI18n } from "@/components/providers/I18nProvider";
import { PageSkeleton } from "@/components/shared/Skeletons";


export function TeacherDashboard() {
  const { t, formatPercent } = useI18n();
  const { query, result } = useCustom({ url: "dashboards/teacher", method: "get" });
  const data = (result?.data as any) ?? {};

  if (query.isLoading && !result?.data) {
    return <PageSkeleton />;
  }

  const scheduleColumns = [
    { title: t("teacher.time"), dataIndex: "time", key: "time" },
    { title: t("teacher.duration"), dataIndex: "duration", key: "duration" },
    { title: t("teacher.subject"), dataIndex: "subject", key: "subject" },
    { title: t("teacher.room"), dataIndex: "room", key: "room" },
    {
      title: t("teacher.status"),
      key: "status",
      render: (_: any, s: any) => (
        <Tag color={s.status === "taught" ? "green" : s.status === "cancelled" ? "red" : "blue"}>
          {s.status === "taught" ? t("teacher.done") : s.status === "cancelled" ? t("status.cancelled") : t("teacher.upcoming")}
        </Tag>
      ),
    },
  ];

  return (
    <Space direction="vertical" size="middle" style={{ width: "100%" }}>
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic title={t("teacher.classesToday")} value={data.todaySessions?.length ?? 0} prefix={<CalendarOutlined />} />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic title={t("teacher.pendingGrades")} value={data.pendingGradeEntries ?? 0} prefix={<FileTextOutlined />} />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic title={t("teacher.totalStudents")} value={data.activeStudents ?? 0} prefix={<TeamOutlined />} />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic title={t("teacher.attendancePct")} value={formatPercent(data.avgAttendanceRate ?? 0)} prefix={<CheckCircleOutlined />} />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24}>
          <Card title={t("teacher.todaySchedule")}>
            <Table
              dataSource={data.todaySessions || []}
              columns={scheduleColumns}
              rowKey={(r) => r.id}
              pagination={false}
              size="small"
              locale={{ emptyText: t("teacher.noClassesToday") }}
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={14}>
          <Card title={t("teacher.weeklyAttendanceTrend")}>
            <LineChart
              series={teacherAttendanceLineSeries(data.analytics?.attendanceTrend ?? [])}
              showArea
              yValueFormatter={(value) => `${Math.round(value)}%`}
              emptyText={t("teacher.noAttendanceTrend")}
            />
          </Card>
        </Col>
        <Col xs={24} lg={10}>
          <Card title={t("teacher.pendingVsGraded")}>
            <BarChart
              data={teacherGradeLoadBarData((data.analytics?.gradeLoad ?? []).slice(0, 8))}
              series={[
                { key: "pending", label: t("teacher.pending"), color: "#f97315" },
                { key: "graded", label: t("teacher.graded"), color: "#22c55f" },
              ]}
              stacked
              emptyText={t("teacher.noGradeLoad")}
            />
          </Card>
        </Col>
      </Row>

      <Card title={t("teacher.scoreDistribution")}>
        <BarChart
          data={scoreDistributionBarData(data.analytics?.scoreDistribution ?? [])}
          series={[{ key: "count", label: t("teacher.scores"), color: "#8b5cf6" }]}
          emptyText={t("teacher.noDistribution")}
        />
      </Card>
    </Space>
  );
}
