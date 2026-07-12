"use client";

import React from "react";
import { useList } from "@refinedev/core";
import { Card, Table, Tag, Progress, Statistic, Row, Col, Space } from "antd";
import { StarOutlined, TrophyOutlined, BookOutlined, BarChartOutlined } from "@ant-design/icons";
import { BarChart } from "@/components/charts";
import { useI18n } from "@/components/providers/I18nProvider";
const CHART_COLORS = ["#0fa5e9", "#8b5cf6", "#177674", "#f97315", "#22c55f", "#ed4899", "#600000"];

function percentageToGrade(pct: number): string {
  if (pct >= 97) return "A+";
  if (pct >= 93) return "A";
  if (pct >= 90) return "A-";
  if (pct >= 87) return "B+";
  if (pct >= 83) return "B";
  if (pct >= 80) return "B-";
  if (pct >= 77) return "C+";
  if (pct >= 73) return "C";
  if (pct >= 70) return "C-";
  if (pct >= 67) return "D+";
  if (pct >= 60) return "D";
  return "F";
}

function letterToGPA(letter: string): number {
  const map: Record<string, number> = { "A+": 4.0, "A": 4.0, "A-": 3.7, "B+": 3.3, "B": 3.0, "B-": 2.7, "C+": 2.3, "C": 2.0, "C-": 1.7, "D+": 1.3, "D": 1.0, "F": 0.0 };
  return map[letter] ?? 0;
}

export function GradesScreen() {
  const { t, formatPercent } = useI18n();
  const { query, result } = useList({ resource: "grades" });
  const { result: coursesResult } = useList({ resource: "courses", pagination: { pageSize: 100 } });
  const grades = (result?.data ?? []) as any[];
  const courses = (coursesResult?.data ?? []) as any[];

  // Build courseId → title map from fetched courses
  const courseNameMap = new Map<string, string>();
  for (const c of courses) {
    courseNameMap.set(c._id || c.id, c.title || c.subject || c._id || c.id);
  }

  const courseMap = new Map<string, { name: string; subject: string; scores: { score: number; max: number }[] }>();
  for (const g of grades) {
    if (!courseMap.has(g.courseId)) {
      courseMap.set(g.courseId, { name: courseNameMap.get(g.courseId) || g.courseName || g.courseId, subject: g.subject || "", scores: [] });
    }
    const myScore = g.scores?.[0];
    if (myScore) courseMap.get(g.courseId)!.scores.push({ score: myScore.score, max: g.maxScore });
  }

  const rows = Array.from(courseMap.entries()).map(([courseId, data], i) => {
    const totalScore = data.scores.reduce((a, b) => a + b.score, 0);
    const totalMax = data.scores.reduce((a, b) => a + b.max, 0);
    const pct = totalMax > 0 ? Math.round((totalScore / totalMax) * 100) : 0;
    return { courseId, name: data.name, subject: data.subject, pct, grade: percentageToGrade(pct), entries: data.scores.length, color: CHART_COLORS[i % CHART_COLORS.length] };
  });

  const gpa = rows.length > 0 ? (rows.reduce((a, b) => a + letterToGPA(b.grade), 0) / rows.length).toFixed(1) : "—";
  const best = rows.reduce<(typeof rows)[0] | null>((best, r) => (!best || r.pct > best.pct ? r : best), null);

  if (query.isLoading) {
    return <div style={{ textAlign: "center", padding: 40, color: "#888" }}>{t("common.loading")}</div>;
  }

  const columns = [
    {
      title: t("studentClass.subject"),
      key: "subject",
      render: (_: any, r: any) => (
        <Space>
          <span style={{ width: 10, height: 10, borderRadius: "50%", display: "inline-block", background: r.color }} />
          <span style={{ fontWeight: 600 }}>{r.subject || r.name}</span>
        </Space>
      ),
    },
    { title: t("studentClass.entries"), dataIndex: "entries", key: "entries" },
    {
      title: t("studentClass.score"),
      key: "score",
      render: (_: any, r: any) => (
        <Space>
          <Progress percent={r.pct} size="small" style={{ width: 100 }} showInfo={false} />
          <span>{formatPercent(r.pct)}</span>
        </Space>
      ),
    },
    {
      title: t("studentClass.grade"),
      key: "grade",
      render: (_: any, r: any) => <Tag color={r.pct >= 90 ? "green" : r.pct >= 75 ? "blue" : "orange"}>{r.grade}</Tag>,
    },
  ];

  return (
    <Space direction="vertical" size="middle" style={{ width: "100%" }}>
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={6}>
          <Card><Statistic title={t("studentClass.overallGpa")} value={String(gpa)} prefix={<StarOutlined />} /></Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card><Statistic title={t("studentClass.highestGrade")} value={best?.grade || "—"} prefix={<TrophyOutlined />} valueStyle={{ color: "#22c55f" }} /></Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card><Statistic title={t("studentClass.subjects")} value={courseMap.size} prefix={<BookOutlined />} /></Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card><Statistic title={t("studentClass.entries")} value={grades.length} prefix={<BarChartOutlined />} /></Card>
        </Col>
      </Row>

      <Card title={t("studentClass.gradesTitle")}>
        <Card size="small" title={t("studentClass.subjectComparison")} style={{ marginBottom: 16 }}>
          <BarChart
            data={rows.map((row) => ({ label: row.subject || row.name, pct: row.pct }))}
            series={[{ key: "pct", label: t("studentClass.averagePercent"), color: "#0fa5e9" }]}
            horizontal
            yValueFormatter={(value) => formatPercent(Math.round(value))}
            emptyText={t("studentClass.noSubjectTrend")}
          />
        </Card>
        <Table
          dataSource={rows}
          columns={columns}
          rowKey={(r) => r.courseId}
          pagination={false}
          locale={{ emptyText: t("studentClass.noGrades") }}
          size="small"
        />
      </Card>
    </Space>
  );
}
