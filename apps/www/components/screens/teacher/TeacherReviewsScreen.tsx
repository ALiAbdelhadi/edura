"use client";

import React from "react";
import { useList } from "@refinedev/core";
import {
  Card,
  Space,
  Table,
  Rate,
  Typography,
  Statistic,
  Row,
  Col,
} from "antd";
import {
  StarOutlined,
  UserOutlined,
  MessageOutlined,
} from "@ant-design/icons";
import { useI18n } from "@/components/providers/I18nProvider";

export function TeacherReviewsScreen() {
  const { t, formatDate } = useI18n();
  const { query, result } = useList({
    resource: "reviews",
    pagination: { pageSize: 20, currentPage: 1 },
  });

  const reviews = (result?.data ?? []) as any[];
  const total = result?.total ?? 0;

  const avgRating =
    reviews.length > 0
      ? (reviews.reduce((s, r) => s + (r.rating || 0), 0) / reviews.length).toFixed(1)
      : "0.0";

  const columns = [
    {
      title: t("teacher.student"),
      key: "student",
      render: (_: any, record: any) => {
        const student = record.studentId;
        return (
          <Space>
            <UserOutlined />
            <span>{student?.name || t("teacher.anonymous")}</span>
          </Space>
        );
      },
    },
    {
      title: t("teacher.rating"),
      dataIndex: "rating",
      key: "rating",
      render: (v: number) => <Rate disabled defaultValue={v} style={{ fontSize: 14 }} />,
    },
    {
      title: t("teacher.comment"),
      dataIndex: "text",
      key: "text",
      ellipsis: true,
      render: (v: string) => v || <em style={{ color: "#888" }}>{t("teacher.noComment")}</em>,
    },
    {
      title: t("teacher.date"),
      dataIndex: "createdAt",
      key: "createdAt",
      render: (v: string) => (v ? formatDate(v) : "—"),
    },
  ];

  return (
    <Space direction="vertical" size="middle" style={{ width: "100%" }}>
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={8}>
          <Card>
            <Statistic
              title={t("teacher.averageRating")}
              value={avgRating}
              prefix={<StarOutlined />}
              suffix="/ 5"
              valueStyle={{ color: "#faad14" }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={8}>
          <Card>
            <Statistic
              title={t("teacher.totalReviews")}
              value={total}
              prefix={<MessageOutlined />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={8}>
          <Card>
            <Statistic
              title={t("teacher.fiveStarReviews")}
              value={reviews.filter((r) => r.rating === 5).length}
              prefix={<StarOutlined />}
              valueStyle={{ color: "#52c41a" }}
            />
          </Card>
        </Col>
      </Row>

      <Card title={t("teacher.reviews")} loading={query.isLoading}>
        <Table
          dataSource={reviews}
          columns={columns}
          rowKey={(record) => record.id || record._id}
          pagination={{ pageSize: 10 }}
          locale={{ emptyText: t("teacher.noReviews") }}
        />
      </Card>
    </Space>
  );
}
