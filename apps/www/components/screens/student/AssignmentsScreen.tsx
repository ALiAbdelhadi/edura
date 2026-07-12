"use client";

import React, { useState } from "react";
import { useList } from "@refinedev/core";
import { Card, Table, Tag, Button, Space, Statistic, Row, Col } from "antd";
import { FileTextOutlined, TrophyOutlined, CheckCircleOutlined, BarChartOutlined } from "@ant-design/icons";
import { BarChart } from "@/components/charts";
import { useI18n } from "@/components/providers/I18nProvider";

export function AssignmentsScreen() {
  const { t, formatDate, formatPercent } = useI18n();
  const { query, result } = useList({ resource: "grades" });
  const [filter, setFilter] = useState<"all" | "pending" | "graded">("all");

  const grades = (result?.data ?? []) as any[];

  const assignments = grades.map((g: any) => {
    const myScore = g.scores?.[0];
    const status = myScore ? "graded" : "pending";
    return {
      id: g.id || g._id,
      title: g.name,
      subject: g.courseId,
      status,
      score: myScore ? `${myScore.score}/${g.maxScore}` : undefined,
      date: formatDate(g.date, { month: "short", day: "numeric" }),
    };
  });

  const filtered = filter === "all" ? assignments : assignments.filter((a) => a.status === filter);
  const pending = assignments.filter((a) => a.status === "pending").length;
  const graded = assignments.filter((a) => a.status === "graded").length;
  const completion = assignments.length > 0 ? Math.round((graded / assignments.length) * 100) : 0;

  const weeklyTrend = React.useMemo(() => {
    const map = new Map<string, { label: string; pending: number; graded: number }>();
    for (const assignment of assignments) {
      const source = grades.find((g: any) => (g.id || g._id) === assignment.id);
      if (!source?.date) continue;
      const date = new Date(source.date);
      const period = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-W${Math.ceil(date.getUTCDate() / 7)}`;
      const label = `${formatDate(date, { month: "short" })} ${t("studentClass.weekShort")}${Math.ceil(date.getUTCDate() / 7)}`;
      const bucket = map.get(period) ?? { label, pending: 0, graded: 0 };
      if (assignment.status === "graded") bucket.graded += 1;
      else bucket.pending += 1;
      map.set(period, bucket);
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, value]) => value)
      .slice(-8);
  }, [assignments, grades, formatDate, t]);

  const columns = [
    { title: t("studentClass.assignment"), dataIndex: "title", key: "title" },
    { title: t("studentClass.subject"), dataIndex: "subject", key: "subject" },
    { title: t("studentClass.date"), dataIndex: "date", key: "date" },
    { title: t("studentClass.score"), dataIndex: "score", key: "score", render: (v: string) => v || "—" },
    {
      title: t("studentClass.statusLabel"),
      key: "status",
      render: (_: any, r: any) => (
        <Tag color={r.status === "graded" ? "green" : "orange"}>
          {r.status === "graded" ? t("studentClass.graded") : t("status.pending")}
        </Tag>
      ),
    },
  ];

  if (query.isLoading) {
    return <div style={{ textAlign: "center", padding: 40, color: "#888" }}>{t("common.loading")}</div>;
  }

  return (
    <Space direction="vertical" size="middle" style={{ width: "100%" }}>
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={6}>
          <Card><Statistic title={t("status.pending")} value={pending} prefix={<FileTextOutlined />} valueStyle={{ color: "#f97315" }} /></Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card><Statistic title={t("studentClass.graded")} value={graded} prefix={<TrophyOutlined />} valueStyle={{ color: "#22c55f" }} /></Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card><Statistic title={t("studentClass.totalEntries")} value={assignments.length} prefix={<CheckCircleOutlined />} /></Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card><Statistic title={t("studentClass.completion")} value={formatPercent(completion)} prefix={<BarChartOutlined />} valueStyle={{ color: "#0fa5e9" }} /></Card>
        </Col>
      </Row>

      <Card
        title={t("nav.assignments")}
        extra={
          <Space>
            {(["all", "pending", "graded"] as const).map((f) => (
              <Button key={f} type={filter === f ? "primary" : "default"} size="small" onClick={() => setFilter(f)}>
                {f === "all" ? t("studentClass.filterAll") : f === "pending" ? t("status.pending") : t("studentClass.graded")}
              </Button>
            ))}
          </Space>
        }
      >
        <Card size="small" title={t("studentClass.dueVsCompleted")} style={{ marginBottom: 16 }}>
          <BarChart
            data={weeklyTrend}
            series={[
              { key: "pending", label: t("status.pending"), color: "#f97315" },
              { key: "graded", label: t("status.completed"), color: "#22c55f" },
            ]}
            stacked
            emptyText={t("studentClass.noWeeklyTrend")}
          />
        </Card>
        <Table
          dataSource={filtered}
          columns={columns}
          rowKey={(r) => r.id}
          pagination={{ pageSize: 10 }}
          locale={{ emptyText: t("studentClass.noAssignments") }}
          size="small"
        />
      </Card>
    </Space>
  );
}
