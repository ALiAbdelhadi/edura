"use client";

import React from "react";
import { useCustom } from "@refinedev/core";
import { Card, Statistic, Row, Col, Space } from "antd";
import { CheckCircleOutlined, CloseCircleOutlined, ClockCircleOutlined, CalendarOutlined } from "@ant-design/icons";
import { HeatmapCalendar } from "@/components/charts";
import { attendanceRecordsToHeatmapCells } from "@/lib/analytics/transforms";
import { useI18n } from "@/components/providers/I18nProvider";

export function AttendanceScreen({ studentId }: { studentId?: string } = {}) {
  const { t } = useI18n();
  const url = studentId ? `me/attendance?studentId=${studentId}` : "me/attendance";
  const { query, result } = useCustom({ url, method: "get" });
  const summary = (result?.data as any) || null;

  if (query.isLoading) {
    return <div style={{ textAlign: "center", padding: 40, color: "#888" }}>{t("common.loading")}</div>;
  }

  const present = summary?.present ?? 0;
  const absent = summary?.absent ?? 0;
  const late = summary?.late ?? 0;
  const total = summary?.total ?? 0;

  const dateStatusMap = new Map<string, "present" | "absent" | "late">();
  for (const rec of summary?.records ?? []) {
    if (!rec.date) continue;
    const status = rec.status as "present" | "absent" | "late";
    const priority: Record<string, number> = { absent: 2, late: 1, present: 0 };
    const existing = dateStatusMap.get(rec.date);
    if (!existing || (priority[status] ?? 0) > (priority[existing] ?? 0)) {
      dateStatusMap.set(rec.date, status);
    }
  }

  const sortedDates = Array.from(dateStatusMap.entries()).sort(([a], [b]) => a.localeCompare(b));
  const recentDates = sortedDates.slice(-28);

  const statusConfig = {
    present: { label: t("status.present") },
    absent: { label: t("status.absent") },
    late: { label: t("status.late") },
  };

  return (
    <Space direction="vertical" size="middle" style={{ width: "100%" }}>
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={8}>
          <Card><Statistic title={t("studentClass.presentDays")} value={present} prefix={<CheckCircleOutlined />} valueStyle={{ color: "#22c55f" }} /></Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card><Statistic title={t("studentClass.absentDays")} value={absent} prefix={<CloseCircleOutlined />} valueStyle={{ color: "#cf1322" }} /></Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card><Statistic title={t("studentClass.lateExcused")} value={late} prefix={<ClockCircleOutlined />} valueStyle={{ color: "#f97315" }} /></Card>
        </Col>
      </Row>

      <Card title={t("studentClass.heatmapTitle")}>
        {recentDates.length === 0 ? (
          <div style={{ textAlign: "center", padding: 40, color: "#888" }}>{t("studentClass.noAttendance")}</div>
        ) : (
          <Space direction="vertical" style={{ width: "100%" }}>
            <HeatmapCalendar
              cells={attendanceRecordsToHeatmapCells(
                recentDates.map(([date, status]) => ({ date, status })),
              )}
              emptyText={t("studentClass.noAttendance")}
            />
            <Space size="large">
              {(["present", "late", "absent"] as const).map((status) => (
                <span key={status} style={{ fontSize: 12, color: "#555a6a" }}>
                  {statusConfig[status].label}
                </span>
              ))}
            </Space>
          </Space>
        )}
      </Card>
    </Space>
  );
}
