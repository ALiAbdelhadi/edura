"use client";

import React from "react";
import { useParams, useRouter } from "next/navigation";
import { useCustom } from "@refinedev/core";
import { Card, Button, Tag, Space, Row, Col, Statistic, Descriptions, Table, Spin } from "antd";
import {
  ArrowLeftOutlined,
  BankOutlined,
  BookOutlined,
  TeamOutlined,
  StarOutlined,
  PhoneOutlined,
  MailOutlined,
  EnvironmentOutlined,
} from "@ant-design/icons";
import Link from "next/link";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function formatSchedule(pattern: any): string {
  if (!pattern?.daysOfWeek?.length) return "TBD";
  const days = pattern.daysOfWeek.map((d: number) => DAY_NAMES[d] ?? "?").join(", ");
  return `${days} ${pattern.startTime ?? ""}–${pattern.endTime ?? ""}`.trim();
}

export default function CenterDetailPage() {
  const params = useParams<{ id?: string | string[] }>();
  const router = useRouter();
  const rawId = Array.isArray(params.id) ? params.id[0] : params.id;
  const centerId = rawId ? decodeURIComponent(rawId) : "";

  const { query, result } = useCustom({
    url: centerId ? `centers/${centerId}` : "",
    method: "get",
    queryOptions: { enabled: !!centerId },
  });

  const center = result?.data as any;

  if (query.isLoading) {
    return <div style={{ display: "flex", justifyContent: "center", padding: 80 }}><Spin size="large" /></div>;
  }

  if (!center) {
    return (
      <div style={{ maxWidth: 900, margin: "0 auto", padding: 24 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => router.back()} style={{ marginBottom: 16 }}>
          Back
        </Button>
        <Card>
          <p style={{ textAlign: "center", color: "#888" }}>Center not found.</p>
        </Card>
      </div>
    );
  }

  const courseColumns = [
    {
      title: "Course",
      key: "title",
      render: (_: any, r: any) => (
        <Space direction="vertical" size={0}>
          <Link href={`/courses/${r.id}`} style={{ fontWeight: 600, color: "#0fa5e9" }}>{r.title}</Link>
          <span style={{ fontSize: 12, color: "#888" }}>{r.subject}{r.gradeTag ? ` · ${r.gradeTag}` : ""}</span>
        </Space>
      ),
    },
    {
      title: "Teacher",
      dataIndex: "teacherName",
      key: "teacherName",
      render: (v: string) => v || "TBD",
    },
    {
      title: "Schedule",
      key: "schedule",
      render: (_: any, r: any) => formatSchedule(r.schedulePattern),
    },
    {
      title: "Price",
      key: "price",
      render: (_: any, r: any) => `EGP ${((r.price ?? 0) / 100).toLocaleString()}`,
    },
    {
      title: "Seats",
      key: "seats",
      render: (_: any, r: any) => {
        const remaining = r.maxStudents - (r.enrolledCount ?? 0);
        return (
          <span style={{ color: remaining <= 0 ? "#cf1322" : remaining <= 3 ? "#f97315" : "#22c55f" }}>
            {r.enrolledCount ?? 0}/{r.maxStudents}
          </span>
        );
      },
    },
    {
      title: "",
      key: "action",
      render: (_: any, r: any) => (
        <Link href={`/courses/${r.id}`}>
          <Button size="small" type="link">View</Button>
        </Link>
      ),
    },
  ];

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: 24 }}>
      <Button icon={<ArrowLeftOutlined />} onClick={() => router.back()} style={{ marginBottom: 16 }}>
        Back
      </Button>

      <Card
        title={
          <Space>
            <BankOutlined style={{ color: "#0fa5e9" }} />
            <span style={{ fontSize: 20 }}>{center.name}</span>
            {center.shortId && <Tag>{center.shortId}</Tag>}
          </Space>
        }
      >
        <Row gutter={[24, 24]}>
          <Col xs={24} md={16}>
            <Space direction="vertical" size="large" style={{ width: "100%" }}>
              {center.description && (
                <p style={{ color: "#555", lineHeight: 1.6 }}>{center.description}</p>
              )}

              {center.subjects?.length > 0 && (
                <div>
                  <div style={{ fontWeight: 600, marginBottom: 8 }}>Subjects</div>
                  <Space wrap>
                    {center.subjects.map((s: string) => (
                      <Tag key={s} color="blue">{s}</Tag>
                    ))}
                  </Space>
                </div>
              )}

              <Descriptions column={{ xs: 1, sm: 2 }} size="small" bordered>
                {center.address && (
                  <Descriptions.Item label={<><EnvironmentOutlined /> Address</>}>
                    {center.address}
                  </Descriptions.Item>
                )}
                {center.phone && (
                  <Descriptions.Item label={<><PhoneOutlined /> Phone</>}>
                    {center.phone}
                  </Descriptions.Item>
                )}
                {center.email && (
                  <Descriptions.Item label={<><MailOutlined /> Email</>}>
                    {center.email}
                  </Descriptions.Item>
                )}
              </Descriptions>
            </Space>
          </Col>

          <Col xs={24} md={8}>
            <Space direction="vertical" size="middle" style={{ width: "100%" }}>
              <Card size="small">
                <Statistic
                  title="Rating"
                  value={center.rating || "—"}
                  suffix={center.rating ? "/ 5" : ""}
                  prefix={<StarOutlined />}
                  valueStyle={{ color: "#f97315" }}
                />
                <div style={{ fontSize: 12, color: "#888", marginTop: 4 }}>
                  {center.reviewCount} review{center.reviewCount !== 1 ? "s" : ""}
                </div>
              </Card>
              <Card size="small">
                <Statistic title="Courses" value={center.totalCourses} prefix={<BookOutlined />} />
              </Card>
              <Card size="small">
                <Statistic title="Students" value={center.totalStudents} prefix={<TeamOutlined />} />
              </Card>
            </Space>
          </Col>
        </Row>
      </Card>

      <Card title="Available Courses" style={{ marginTop: 24 }}>
        <Table
          dataSource={center.courses ?? []}
          columns={courseColumns}
          rowKey={(r) => r.id}
          pagination={false}
          size="small"
          locale={{ emptyText: "No active courses." }}
        />
      </Card>
    </div>
  );
}
