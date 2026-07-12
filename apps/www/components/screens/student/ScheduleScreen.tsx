"use client";

import React from "react";
import { useList } from "@refinedev/core";
import { Card, Table, Tag, Row, Col, Statistic, Space, Modal, Descriptions } from "antd";
import { CalendarOutlined, CheckCircleOutlined, ClockCircleOutlined, CloseCircleOutlined, BookOutlined, UserOutlined, HomeOutlined, FieldTimeOutlined } from "@ant-design/icons";
import Link from "next/link";
import { useI18n } from "@/components/providers/I18nProvider";

const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const dayKeys = ["daySun", "dayMon", "dayTue", "dayWed", "dayThu", "dayFri", "daySat"];

export function ScheduleScreen() {
  const { t, formatDate } = useI18n();
  const [dayIndex, setDayIndex] = React.useState(new Date().getDay());
  const [selectedSession, setSelectedSession] = React.useState<any>(null);
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const dayLabel = (i: number) => t(`studentClass.${dayKeys[i]}`);

  const { query: coursesQuery, result: coursesResult } = useList({
    resource: "enrollments",
    filters: [{ field: "studentId", operator: "eq", value: "me" }],
  });
  const { query: sessionsQuery, result: sessionsResult } = useList({
    resource: "sessions",
    filters: [{ field: "studentId", operator: "eq", value: "me" }],
  });

  const courses = (coursesResult?.data ?? []) as any[];
  const sessions = (sessionsResult?.data ?? []) as any[];

  const isLoading = coursesQuery.isLoading || sessionsQuery.isLoading;

  if (isLoading) {
    return <div style={{ textAlign: "center", padding: 40, color: "#888" }}>{t("common.loading")}</div>;
  }

  const selectedDayName = days[dayIndex];

  const getDayNameFromDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return dayNames[date.getDay()];
  };

  const daySessions = sessions
    .filter((s: any) => getDayNameFromDate(s.date) === selectedDayName)
    .sort((a: any, b: any) => a.startTime.localeCompare(b.startTime));

  const completed = sessions.filter((s: any) => s.status === "completed").length;
  const upcoming = sessions.filter((s: any) => s.status === "scheduled").length;
  const cancelled = sessions.filter((s: any) => s.status === "cancelled").length;

  const sessionColumns = [
    { title: t("studentClass.start"), dataIndex: "startTime", key: "startTime" },
    { title: t("studentClass.end"), dataIndex: "endTime", key: "endTime" },
    { title: t("studentClass.course"), dataIndex: "courseName", key: "courseName", render: (v: string, r: any) => v ? <Link href={`/courses/${r.courseId}`}>{v}</Link> : `${t("studentClass.course")}: ${r.courseId?.substring(0, 6)}` },
    { title: t("roles.teacher"), dataIndex: "teacherName", key: "teacherName", render: (v: string) => v || t("studentClass.assignedTeacher") },
    { title: t("studentClass.room"), dataIndex: "roomName", key: "roomName", render: (v: string) => v || t("studentClass.tbd") },
    {
      title: t("studentClass.statusLabel"),
      key: "status",
      render: (_: any, r: any) => (
        <Tag color={r.status === "cancelled" ? "red" : r.status === "completed" ? "green" : "blue"}>
          {r.status === "cancelled" ? t("status.cancelled") : r.status === "completed" ? t("status.completed") : t("status.scheduled")}
        </Tag>
      ),
    },
  ];

  return (
    <Row gutter={[16, 16]}>
      <Col xs={24} lg={16}>
        <Card
          title={t("nav.schedule")}
          extra={
            <div>
              {days.map((d, i) => (
                <Tag
                  key={d}
                  color={dayIndex === i ? "blue" : "default"}
                  style={{ cursor: "pointer" }}
                  onClick={() => setDayIndex(i)}
                >
                  {dayLabel(i)}
                </Tag>
              ))}
            </div>
          }
        >
          {daySessions.length === 0 ? (
            <div style={{ textAlign: "center", padding: 40, color: "#888" }}>{t("studentClass.noSessionsOn")} {dayLabel(dayIndex)}</div>
          ) : (
            <Table
              dataSource={daySessions}
              columns={sessionColumns}
              rowKey={(r) => r.id || r._id}
              pagination={false}
              size="small"
              onRow={(record) => ({
                onClick: () => setSelectedSession(record),
                style: { cursor: "pointer" },
              })}
            />
          )}
        </Card>
      </Col>
      <Col xs={24} lg={8}>
        <Row gutter={[16, 16]}>
          <Col span={12}>
            <Card><Statistic title={t("common.total")} value={sessions.length} prefix={<CalendarOutlined />} /></Card>
          </Col>
          <Col span={12}>
            <Card><Statistic title={t("status.completed")} value={completed} prefix={<CheckCircleOutlined />} valueStyle={{ color: "#22c55f" }} /></Card>
          </Col>
          <Col span={12}>
            <Card><Statistic title={t("studentClass.upcoming")} value={upcoming} prefix={<ClockCircleOutlined />} valueStyle={{ color: "#0fa5e9" }} /></Card>
          </Col>
          <Col span={12}>
            <Card><Statistic title={t("status.cancelled")} value={cancelled} prefix={<CloseCircleOutlined />} valueStyle={{ color: "#cf1322" }} /></Card>
          </Col>
        </Row>
        <Card title={t("studentClass.enrolledCourses")} style={{ marginTop: 16 }}>
          {courses.length === 0 ? (
            <div style={{ textAlign: "center", padding: 24, color: "#888" }}>{t("studentClass.noEnrolledCourses")}</div>
          ) : (
            <Space direction="vertical" style={{ width: "100%" }}>
              {courses.map((c: any, i: number) => (
                <div key={c.id || c._id || i} style={{ padding: "8px 0", borderBottom: "1px solid #f0f0f0" }}>
                  <div style={{ fontWeight: 600 }}>{c.courseName || c.title}</div>
                  <div style={{ fontSize: 12, color: "#888" }}>{c.schedulePattern?.daysOfWeek?.join(" / ") || t("studentClass.tbd")}</div>
                </div>
              ))}
            </Space>
          )}
        </Card>
      </Col>

      <Modal
        title={t("studentClass.sessionDetails")}
        open={!!selectedSession}
        onCancel={() => setSelectedSession(null)}
        footer={null}
        width={480}
      >
        {selectedSession && (
          <Descriptions column={1} size="small" bordered>
            <Descriptions.Item label={<><CalendarOutlined /> {t("studentClass.date")}</>}>
              {selectedSession.date
                ? formatDate(selectedSession.date, { weekday: "long", month: "long", day: "numeric", year: "numeric" })
                : "—"}
            </Descriptions.Item>
            <Descriptions.Item label={<><FieldTimeOutlined /> {t("studentClass.time")}</>}>
              {selectedSession.startTime} – {selectedSession.endTime}
            </Descriptions.Item>
            <Descriptions.Item label={<><BookOutlined /> {t("studentClass.course")}</>}>
              <Space>
                {selectedSession.courseName || "—"}
                {selectedSession.courseId && (
                  <Link href={`/courses/${selectedSession.courseId}`} style={{ fontSize: 12 }}>
                    {t("studentClass.viewCourse")}
                  </Link>
                )}
              </Space>
            </Descriptions.Item>
            {selectedSession.subject && (
              <Descriptions.Item label={t("studentClass.subject")}>
                {selectedSession.subject}
              </Descriptions.Item>
            )}
            <Descriptions.Item label={<><UserOutlined /> {t("roles.teacher")}</>}>
              {selectedSession.teacherName || t("studentClass.tbd")}
            </Descriptions.Item>
            <Descriptions.Item label={<><HomeOutlined /> {t("studentClass.room")}</>}>
              {selectedSession.roomName || t("studentClass.tbd")}
            </Descriptions.Item>
            <Descriptions.Item label={t("studentClass.statusLabel")}>
              <Tag color={selectedSession.status === "cancelled" ? "red" : selectedSession.status === "completed" ? "green" : "blue"}>
                {selectedSession.status === "cancelled" ? t("status.cancelled") : selectedSession.status === "completed" ? t("status.completed") : t("status.scheduled")}
              </Tag>
            </Descriptions.Item>
          </Descriptions>
        )}
      </Modal>
    </Row>
  );
}
