"use client";

import React, { useState, useEffect } from "react";
import { useList, useCustomMutation } from "@refinedev/core";
import { Card, Table, Tag, Button, Progress, Popconfirm, Input, DatePicker, TimePicker, Space, Row, Col } from "antd";
import { BookOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { useI18n } from "@/components/providers/I18nProvider";

const statusColors: Record<string, string> = {
  scheduled: "blue",
  completed: "green",
  cancelled: "red",
  postponed: "orange",
};

export function TeacherClassesScreen() {
  const { t, formatDate } = useI18n();
  const { query: coursesQuery, result: coursesResult } = useList({
    resource: "courses",
    filters: [{ field: "teacherId", operator: "eq", value: "me" }],
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const classes = (coursesResult?.data ?? []) as any[];

  useEffect(() => {
    if (classes.length > 0 && !selectedId) {
      setSelectedId(classes[0].id || classes[0]._id);
    }
  }, [classes, selectedId]);

  const { query: sessionsQuery, result: sessionsResult } = useList({
    resource: "sessions",
    filters: selectedId ? [{ field: "courseId", operator: "eq", value: selectedId }] : undefined,
    queryOptions: { enabled: !!selectedId },
  });

  const { mutate: cancelSessionMut, mutation: cancelMutation } = useCustomMutation();
  const { mutate: postponeSessionMut, mutation: postponeMutation } = useCustomMutation();

  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [postponingId, setPostponingId] = useState<string | null>(null);
  const [postponeDate, setPostponeDate] = useState<dayjs.Dayjs | null>(null);
  const [postponeStart, setPostponeStart] = useState<dayjs.Dayjs | null>(null);
  const [postponeEnd, setPostponeEnd] = useState<dayjs.Dayjs | null>(null);
  const [postponeReason, setPostponeReason] = useState("");

  const courseSessions = (sessionsResult?.data ?? []) as any[];

  const handleCancelSession = async (session: any) => {
    if (!cancelReason || !selectedId) return;
    cancelSessionMut(
      {
        url: `sessions/${session.id || session._id}/cancel`,
        method: "post",
        values: { reason: cancelReason },
      },
      {
        onSuccess: () => {
          setCancellingId(null);
          setCancelReason("");
        },
      }
    );
  };

  const handlePostponeSession = async (session: any) => {
    if (!postponeDate || !postponeStart || !postponeEnd || !postponeReason || !selectedId) return;
    postponeSessionMut(
      {
        url: `sessions/${session.id || session._id}/postpone`,
        method: "post",
        values: {
          newDate: postponeDate.format("YYYY-MM-DD"),
          newStartTime: postponeStart.format("HH:mm"),
          newEndTime: postponeEnd.format("HH:mm"),
          reason: postponeReason,
        },
      },
      {
        onSuccess: () => {
          setPostponingId(null);
          setPostponeDate(null);
          setPostponeStart(null);
          setPostponeEnd(null);
          setPostponeReason("");
        },
      }
    );
  };

  const selectedCourse = classes.find((c: any) => (c.id || c._id) === selectedId) || classes[0];

  const sessionColumns = [
    {
      title: t("teacher.date"),
      key: "date",
      render: (_: any, s: any) => (
        <span style={{ fontWeight: 600 }}>
          {formatDate(s.date)} ({s.startTime} - {s.endTime})
        </span>
      ),
    },
    {
      title: t("teacher.status"),
      key: "status",
      render: (_: any, s: any) => (
        <Space>
          <Tag color={statusColors[s.status] || "default"}>
            {t("status." + s.status)}
          </Tag>
          {s.cancelReason && <span style={{ fontSize: 12, color: "#888" }}>{s.cancelReason}</span>}
        </Space>
      ),
    },
    {
      title: t("teacher.actions"),
      key: "actions",
      render: (_: any, s: any) => {
        if (s.status !== "scheduled") return null;
        const sid = s.id || s._id;

        if (cancellingId === sid) {
          return (
            <Space>
              <Input
                placeholder={t("teacher.reason")}
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                style={{ width: 120 }}
                size="small"
              />
              <Button size="small" danger onClick={() => handleCancelSession(s)} loading={cancelMutation.isPending}>
                {t("actions.cancel")}
              </Button>
              <Button size="small" onClick={() => { setCancellingId(null); setCancelReason(""); }}>
                {t("teacher.abort")}
              </Button>
            </Space>
          );
        }

        if (postponingId === sid) {
          return (
            <Space wrap>
              <DatePicker
                value={postponeDate}
                onChange={setPostponeDate}
                size="small"
                placeholder={t("teacher.date")}
              />
              <TimePicker
                value={postponeStart}
                onChange={setPostponeStart}
                size="small"
                format="HH:mm"
                placeholder={t("teacher.start")}
              />
              <TimePicker
                value={postponeEnd}
                onChange={setPostponeEnd}
                size="small"
                format="HH:mm"
                placeholder={t("teacher.end")}
              />
              <Input
                placeholder={t("teacher.reason")}
                value={postponeReason}
                onChange={(e) => setPostponeReason(e.target.value)}
                style={{ width: 120 }}
                size="small"
              />
              <Button size="small" type="primary" onClick={() => handlePostponeSession(s)} loading={postponeMutation.isPending}>
                {t("teacher.postpone")}
              </Button>
              <Button size="small" onClick={() => { setPostponingId(null); setPostponeDate(null); setPostponeStart(null); setPostponeEnd(null); setPostponeReason(""); }}>
                {t("teacher.abort")}
              </Button>
            </Space>
          );
        }

        return (
          <Space>
            <Button size="small" onClick={() => {
              setPostponingId(sid);
              setPostponeDate(dayjs(s.date));
              setPostponeStart(dayjs(s.startTime, "HH:mm"));
              setPostponeEnd(dayjs(s.endTime, "HH:mm"));
            }}>
              {t("teacher.postpone")}
            </Button>
            <Button size="small" danger onClick={() => setCancellingId(sid)}>
              {t("actions.cancel")}
            </Button>
          </Space>
        );
      },
    },
  ];

  if (coursesQuery.isLoading && classes.length === 0) {
    return <div style={{ textAlign: "center", padding: 40, color: "#888" }}>{t("teacher.loadingClasses")}</div>;
  }

  if (coursesQuery.isError && classes.length === 0) {
    return <div style={{ textAlign: "center", padding: 40, color: "red" }}>{t("teacher.loadError")}</div>;
  }

  if (classes.length === 0) {
    return <div style={{ textAlign: "center", padding: 40, color: "#888" }}>{t("teacher.noClasses")}</div>;
  }

  return (
    <Row gutter={[16, 16]}>
      <Col xs={24} lg={6}>
        <Space direction="vertical" style={{ width: "100%" }}>
          {classes.map((c: any, i: number) => {
            const isSelected = selectedId === (c.id || c._id);
            return (
              <Card
                key={c.id || c._id || i}
                size="small"
                style={{
                  cursor: "pointer",
                  borderColor: isSelected ? "#0fa5e9" : undefined,
                  borderWidth: isSelected ? 2 : 1,
                }}
                onClick={() => setSelectedId(c.id || c._id)}
              >
                <Space>
                  <BookOutlined style={{ color: "#0fa5e9" }} />
                  <div>
                    <div style={{ fontWeight: 600 }}>{c.subject} - {c.gradeTag}</div>
                    <div style={{ fontSize: 12, color: "#888" }}>
                      {c.enrolledStudentsCount || 0}/{c.maxStudents} {t("teacher.students")}
                    </div>
                  </div>
                </Space>
              </Card>
            );
          })}
        </Space>
      </Col>

      <Col xs={24} lg={18}>
        <Space direction="vertical" size="middle" style={{ width: "100%" }}>
          <Card>
            <Space direction="vertical" style={{ width: "100%" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontWeight: 700, fontSize: 16 }}>
                  {selectedCourse.subject} - {selectedCourse.gradeTag}
                </span>
                <Tag color={selectedCourse.status === "active" ? "green" : "default"}>
                  {t("status." + selectedCourse.status)}
                </Tag>
              </div>
              <Space wrap style={{ color: "#666" }}>
                <span>{selectedCourse.roomName || t("teacher.tbd")}</span>
                <span>{selectedCourse.schedulePattern?.daysOfWeek?.join(", ") || t("teacher.tbd")} · {selectedCourse.schedulePattern?.startTime} - {selectedCourse.schedulePattern?.endTime}</span>
                <span>{selectedCourse.enrolledStudentsCount || 0}/{selectedCourse.maxStudents} {t("teacher.students")}</span>
              </Space>
              <Progress
                percent={Math.round(((selectedCourse.enrolledStudentsCount || 0) / selectedCourse.maxStudents) * 100)}
                size="small"
              />
            </Space>
          </Card>

          <Card title={t("nav.sessions")}>
            <Table
              dataSource={courseSessions}
              columns={sessionColumns}
              rowKey={(r) => r.id || r._id}
              loading={sessionsQuery.isLoading}
              pagination={false}
              locale={{ emptyText: t("teacher.noSessions") }}
              size="small"
            />
          </Card>
        </Space>
      </Col>
    </Row>
  );
}
