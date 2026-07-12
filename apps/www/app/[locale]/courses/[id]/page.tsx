"use client";

import React, { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useCustom, useCustomMutation } from "@refinedev/core";
import { Card, Button, Tag, Space, Row, Col, Statistic, Descriptions, message, Spin } from "antd";
import {
  ArrowLeftOutlined,
  BookOutlined,
  UserOutlined,
  CalendarOutlined,
  DollarOutlined,
  TeamOutlined,
  StarOutlined,
  ClockCircleOutlined,
  BankOutlined,
} from "@ant-design/icons";
import Link from "next/link";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function formatSchedule(pattern: any): string {
  if (!pattern?.daysOfWeek?.length) return "TBD";
  const days = pattern.daysOfWeek.map((d: number) => DAY_NAMES[d] ?? "?").join(", ");
  return `${days} ${pattern.startTime ?? ""}–${pattern.endTime ?? ""}`.trim();
}

export default function CourseDetailPage() {
  const params = useParams<{ id?: string | string[] }>();
  const router = useRouter();
  const rawId = Array.isArray(params.id) ? params.id[0] : params.id;
  const courseId = rawId ? decodeURIComponent(rawId) : "";

  const { query, result } = useCustom({
    url: courseId ? `courses/${courseId}` : "",
    method: "get",
    queryOptions: { enabled: !!courseId },
  });

  const { mutateAsync: requestEnrollment } = useCustomMutation();
  const [loading, setLoading] = useState(false);

  const course = result?.data as any;

  const handleEnroll = async () => {
    setLoading(true);
    try {
      await requestEnrollment({
        url: "enrollment-requests",
        method: "post",
        values: { courseId },
      });
      message.success("Enrollment request sent!");
    } catch (err: any) {
      message.error(err?.message || "Failed to send request.");
    } finally {
      setLoading(false);
    }
  };

  if (query.isLoading) {
    return <div style={{ display: "flex", justifyContent: "center", padding: 80 }}><Spin size="large" /></div>;
  }

  if (!course) {
    return (
      <div style={{ maxWidth: 800, margin: "0 auto", padding: 24 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => router.back()} style={{ marginBottom: 16 }}>
          Back
        </Button>
        <Card>
          <p style={{ textAlign: "center", color: "#888" }}>Course not found.</p>
        </Card>
      </div>
    );
  }

  const remaining = course.remainingSeats ?? (course.maxStudents - (course.enrolledCount ?? 0));
  const isFull = remaining <= 0;

  return (
    <div style={{ maxWidth: 800, margin: "0 auto", padding: 24 }}>
      <Button icon={<ArrowLeftOutlined />} onClick={() => router.back()} style={{ marginBottom: 16 }}>
        Back
      </Button>

      <Card
        title={
          <Space>
            <BookOutlined style={{ color: "#0fa5e9" }} />
            <span style={{ fontSize: 20 }}>{course.title}</span>
          </Space>
        }
        extra={
          <Button
            type="primary"
            size="large"
            loading={loading}
            disabled={isFull}
            onClick={handleEnroll}
          >
            {isFull ? "Class Full" : "Request Enrollment"}
          </Button>
        }
      >
        <Row gutter={[24, 24]}>
          <Col xs={24} md={16}>
            <Space direction="vertical" size="large" style={{ width: "100%" }}>
              <div>
                <Tag color="blue" style={{ fontSize: 14, padding: "2px 12px" }}>{course.subject}</Tag>
                {course.gradeTag && <Tag style={{ fontSize: 14, padding: "2px 12px", marginLeft: 8 }}>{course.gradeTag}</Tag>}
              </div>

              {course.description && (
                <p style={{ color: "#555", lineHeight: 1.6 }}>{course.description}</p>
              )}

              <Descriptions column={{ xs: 1, sm: 2 }} size="small" bordered>
                <Descriptions.Item label={<><UserOutlined /> Teacher</>}>
                  <Space>
                    {course.teacherName || "TBD"}
                    {course.teacherRating > 0 && (
                      <span style={{ color: "#f97315", fontSize: 12 }}>
                        <StarOutlined /> {course.teacherRating} ({course.teacherReviewCount})
                      </span>
                    )}
                  </Space>
                </Descriptions.Item>
                {course.centerName && (
                  <Descriptions.Item label={<><BankOutlined /> Center</>}>
                    <Link href={`/centers/${course.centerId}`}>{course.centerName}</Link>
                  </Descriptions.Item>
                )}
                <Descriptions.Item label={<><CalendarOutlined /> Schedule</>}>
                  {formatSchedule(course.schedulePattern)}
                </Descriptions.Item>
                <Descriptions.Item label={<><ClockCircleOutlined /> Duration</>}>
                  {course.schedulePattern?.startDate
                    ? `${new Date(course.schedulePattern.startDate).toLocaleDateString("en", { month: "short", day: "numeric" })} – ${new Date(course.schedulePattern.endDate).toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric" })}`
                    : "TBD"}
                </Descriptions.Item>
                <Descriptions.Item label={<><DollarOutlined /> Price</>}>
                  EGP {((course.price ?? 0) / 100).toLocaleString()}
                </Descriptions.Item>
              </Descriptions>
            </Space>
          </Col>

          <Col xs={24} md={8}>
            <Space direction="vertical" size="middle" style={{ width: "100%" }}>
              <Card size="small">
                <Statistic
                  title="Remaining Seats"
                  value={remaining}
                  suffix={`/ ${course.maxStudents}`}
                  valueStyle={{ color: isFull ? "#cf1322" : remaining <= 3 ? "#f97315" : "#22c55f" }}
                  prefix={<TeamOutlined />}
                />
              </Card>
            </Space>
          </Col>
        </Row>
      </Card>
    </div>
  );
}
