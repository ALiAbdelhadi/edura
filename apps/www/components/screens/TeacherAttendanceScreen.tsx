"use client";

import React, { useState, useMemo } from "react";
import { useGetIdentity, useList, useCustom, useCustomMutation, useInvalidate } from "@refinedev/core";
import { Card, Table, Tag, Button, Radio, Space, Empty, message as antMessage, Alert } from "antd";
import { CheckCircleOutlined, CloseCircleOutlined, ClockCircleOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { BarChart } from "@/components/charts";
import { useI18n } from "@/components/providers/I18nProvider";

type Identity = { id: string; name?: string; email?: string };
type EnrollmentRow = { _id?: string; id?: string; studentId: string; studentName?: string; studentEmail?: string };
type SessionRow = { _id?: string; id?: string; courseId: string; teacherId: string; date: string; startTime?: string; endTime?: string; status: string };
type AttendanceRecord = { studentId: string; status: "present" | "absent" | "excused" };
type AttendanceStatus = "present" | "absent" | "excused";

const statusColor: Record<AttendanceStatus, string> = {
  present: "green",
  absent: "red",
  excused: "orange",
};

export function TeacherAttendanceScreen() {
  const { t, formatDate } = useI18n();
  const { data: identity } = useGetIdentity<Identity>();
  const teacherId = identity?.id;

  const { query: sessionsQuery, result: sessionsResult } = useList<SessionRow>({
    resource: "sessions",
    filters: teacherId ? [{ field: "teacherId", operator: "eq", value: teacherId }] : undefined,
    queryOptions: { enabled: !!teacherId },
    pagination: { mode: "off" },
  });

  const allSessions = (sessionsResult?.data ?? []) as SessionRow[];

  const recentSessions = useMemo(() => {
    const now = dayjs();
    return allSessions
      .filter((s) => {
        const d = dayjs(s.date);
        return d.isAfter(now.subtract(14, "day")) && d.isBefore(now.add(1, "day")) && s.status !== "cancelled";
      })
      .sort((a, b) => dayjs(b.date).valueOf() - dayjs(a.date).valueOf());
  }, [allSessions]);

  const [selectedSession, setSelectedSession] = useState<SessionRow | null>(null);
  const sessionId = selectedSession?.id || selectedSession?._id;

  const { result: enrollmentsResult } = useList<EnrollmentRow>({
    resource: "enrollments",
    filters: selectedSession ? [{ field: "courseId", operator: "eq", value: selectedSession.courseId }] : undefined,
    queryOptions: { enabled: !!selectedSession },
    pagination: { mode: "off" },
  });
  const enrollments = (enrollmentsResult?.data ?? []) as EnrollmentRow[];

  const { query: attendanceQuery, result: attendanceResult } = useCustom<{ locked: boolean; records: AttendanceRecord[] }>({
    url: sessionId ? `sessions/${sessionId}/attendance` : "",
    method: "get",
    queryOptions: { enabled: !!sessionId },
  });
  const locked = (attendanceResult?.data as any)?.locked ?? false;
  const existingRecords = (attendanceResult?.data as any)?.records ?? [];

  const [statuses, setStatuses] = useState<Record<string, AttendanceStatus>>({});

  React.useEffect(() => {
    if (!selectedSession) return;
    const next: Record<string, AttendanceStatus> = {};
    for (const e of enrollments) {
      next[e.studentId] = "present";
    }
    for (const r of existingRecords) {
      next[r.studentId] = r.status;
    }
    setStatuses(next);
  }, [selectedSession, enrollments.length, existingRecords.length]);

  const { mutate: saveAttendance, mutation: saveMutation } = useCustomMutation();
  const invalidate = useInvalidate();

  const handleSave = () => {
    if (!sessionId) return;
    const records: AttendanceRecord[] = enrollments.map((e) => ({
      studentId: e.studentId,
      status: statuses[e.studentId] ?? "present",
    }));
    saveAttendance(
      {
        url: `sessions/${sessionId}/attendance`,
        method: "put",
        values: { records } as any,
        config: { headers: {} },
      },
      {
        onSuccess: () => {
          antMessage.success(t("teacher.saved"));
          invalidate({ resource: "sessions", invalidates: ["list"] });
        },
        onError: (err) => {
          antMessage.error((err as { message?: string })?.message || t("teacher.saveError"));
        },
      },
    );
  };

  const sessionColumns = [
    {
      title: t("teacher.date"),
      key: "date",
      render: (_: unknown, s: SessionRow) => (
        <span>{formatDate(s.date, { weekday: "short", month: "short", day: "numeric" })} · {s.startTime}–{s.endTime}</span>
      ),
    },
    {
      title: t("teacher.status"),
      key: "status",
      render: (_: unknown, s: SessionRow) => (
        <Tag color={s.status === "completed" ? "green" : s.status === "scheduled" ? "blue" : "default"}>
          {t("status." + s.status)}
        </Tag>
      ),
    },
    {
      title: "",
      key: "action",
      render: (_: unknown, s: SessionRow) => (
        <Button size="small" type="primary" onClick={() => setSelectedSession(s)}>
          {t("teacher.markAttendance")}
        </Button>
      ),
    },
  ];

  const rosterColumns = [
    {
      title: t("teacher.student"),
      key: "name",
      render: (_: unknown, e: EnrollmentRow) => (
        <Space direction="vertical" size={0}>
          <span style={{ fontWeight: 600 }}>{e.studentName || e.studentId}</span>
          {e.studentEmail && <span style={{ fontSize: 12, color: "#888" }}>{e.studentEmail}</span>}
        </Space>
      ),
    },
    {
      title: t("teacher.status"),
      key: "status",
      render: (_: unknown, e: EnrollmentRow) => {
        const v = statuses[e.studentId] ?? "present";
        return (
          <Radio.Group
            value={v}
            disabled={locked}
            onChange={(ev) => setStatuses((s) => ({ ...s, [e.studentId]: ev.target.value }))}
            optionType="button"
            buttonStyle="solid"
            size="small"
          >
            <Radio.Button value="present"><CheckCircleOutlined /> {t("status.present")}</Radio.Button>
            <Radio.Button value="absent"><CloseCircleOutlined /> {t("status.absent")}</Radio.Button>
            <Radio.Button value="excused"><ClockCircleOutlined /> {t("status.excused")}</Radio.Button>
          </Radio.Group>
        );
      },
    },
    {
      title: t("teacher.tag"),
      key: "tag",
      render: (_: unknown, e: EnrollmentRow) => {
        const v = statuses[e.studentId] ?? "present";
        return <Tag color={statusColor[v]}>{t("status." + v)}</Tag>;
      },
    },
  ];

  if (selectedSession) {
    const sessionComposition = [
      {
        label: formatDate(selectedSession.date, { month: "short", day: "numeric" }),
        present: Object.values(statuses).filter((s) => s === "present").length,
        absent: Object.values(statuses).filter((s) => s === "absent").length,
        excused: Object.values(statuses).filter((s) => s === "excused").length,
      },
    ];

    return (
      <Card
        title={`${t("teacher.attendance")} — ${formatDate(selectedSession.date, { weekday: "short", month: "short", day: "numeric" })} · ${selectedSession.startTime}–${selectedSession.endTime}`}
        extra={
          <Space>
            <Button onClick={() => setSelectedSession(null)}>{t("teacher.back")}</Button>
            <Button
              type="primary"
              loading={saveMutation.isPending}
              disabled={locked || enrollments.length === 0}
              onClick={handleSave}
            >
              {t("teacher.saveAttendance")}
            </Button>
          </Space>
        }
      >
        {locked && (
          <Alert
            type="warning"
            showIcon
            message={t("teacher.editClosed")}
            description={t("teacher.editClosedDesc")}
            style={{ marginBottom: 16 }}
          />
        )}
        <Card size="small" title={t("teacher.composition")} style={{ marginBottom: 16 }}>
          <BarChart
            data={sessionComposition}
            series={[
              { key: "present", label: t("status.present"), color: "#22c55f" },
              { key: "absent", label: t("status.absent"), color: "#ef4444" },
              { key: "excused", label: t("status.excused"), color: "#f97315" },
            ]}
            stacked
          />
        </Card>
        <Table
          dataSource={enrollments}
          columns={rosterColumns}
          rowKey={(r) => r.studentId}
          loading={attendanceQuery.isLoading}
          pagination={false}
          locale={{ emptyText: t("teacher.noStudents") }}
          size="small"
        />
      </Card>
    );
  }

  return (
    <Card title={t("teacher.takeAttendance")} extra={<span style={{ color: "#888", fontSize: 12 }}>{t("teacher.last14Days")}</span>}>
      {sessionsQuery.isLoading ? (
        <div style={{ textAlign: "center", padding: 40, color: "#888" }}>{t("teacher.loadingSessions")}</div>
      ) : recentSessions.length === 0 ? (
        <Empty description={t("teacher.noRecentSessions")} />
      ) : (
        <Table
          dataSource={recentSessions}
          columns={sessionColumns}
          rowKey={(r) => r.id || r._id || ""}
          pagination={{ pageSize: 10 }}
          size="small"
        />
      )}
    </Card>
  );
}
