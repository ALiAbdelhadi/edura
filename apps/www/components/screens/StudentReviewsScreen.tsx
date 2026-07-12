"use client";

import React, { useState } from "react";
import { useList, useCreate, useUpdate, useCustom } from "@refinedev/core";
import {
  Card,
  Button,
  Space,
  Table,
  Tag,
  Modal,
  Form,
  Input,
  Rate,
  Typography,
  message,
  Statistic,
  Row,
  Col,
} from "antd";
import {
  StarOutlined,
  EditOutlined,
  UserOutlined,
  SendOutlined,
} from "@ant-design/icons";
import { useI18n } from "@/components/providers/I18nProvider";

export function StudentReviewsScreen() {
  const { t, formatDate } = useI18n();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingReview, setEditingReview] = useState<any>(null);
  const [selectedTeacher, setSelectedTeacher] = useState<any>(null);
  const [form] = Form.useForm();

  const { query: eligibleQuery, result: eligibleResult } = useCustom({
    url: "reviews/eligible",
    method: "get",
  });
  const { query: reviewsQuery, result: reviewsResult } = useList({
    resource: "reviews",
    pagination: { pageSize: 20, currentPage: 1 },
  });
  const { mutate: createReview, mutation: createMutation } = useCreate();
  const { mutate: updateReview, mutation: updateMutation } = useUpdate();

  const eligibleTeachers: any[] = Array.isArray(eligibleResult?.data)
    ? (eligibleResult.data as any[])
    : [];
  const reviews = (reviewsResult?.data ?? []) as any[];

  const handleOpenCreate = (teacher: any) => {
    setSelectedTeacher(teacher);
    setEditingReview(null);
    form.resetFields();
    setIsModalOpen(true);
  };

  const handleOpenEdit = (review: any) => {
    setSelectedTeacher(null);
    setEditingReview(review);
    form.setFieldsValue({
      rating: review.rating,
      text: review.text,
    });
    setIsModalOpen(true);
  };

  const handleSubmit = (values: { rating: number; text?: string }) => {
    if (editingReview) {
      updateReview(
        { resource: "reviews", id: editingReview.id || editingReview._id, values },
        {
          onSuccess: () => {
            message.success(t("studentReviews.reviewUpdated"));
            setIsModalOpen(false);
            form.resetFields();
            reviewsQuery.refetch();
          },
          onError: (err: any) => message.error(err?.message || t("studentReviews.reviewUpdateFailed")),
        }
      );
    } else if (selectedTeacher) {
      createReview(
        {
          resource: "reviews",
          values: { teacherId: selectedTeacher.id || selectedTeacher._id, ...values },
        },
        {
          onSuccess: () => {
            message.success(t("studentReviews.reviewSubmitted"));
            setIsModalOpen(false);
            form.resetFields();
            reviewsQuery.refetch();
            eligibleQuery.refetch();
          },
          onError: (err: any) => message.error(err?.message || t("studentReviews.reviewSubmitFailed")),
        }
      );
    }
  };

  const eligibleColumns = [
    {
      title: t("roles.teacher"),
      key: "teacher",
      render: (_: any, record: any) => (
        <Space>
          <UserOutlined />
          <span>{record.name}</span>
        </Space>
      ),
    },
    {
      title: t("auth.email"),
      dataIndex: "email",
      key: "email",
    },
    {
      title: t("studentReviews.actions"),
      key: "actions",
      render: (_: any, record: any) => (
        <Button
          type="primary"
          size="small"
          icon={<StarOutlined />}
          onClick={() => handleOpenCreate(record)}
        >
          {t("studentReviews.writeReview")}
        </Button>
      ),
    },
  ];

  const reviewColumns = [
    {
      title: t("roles.teacher"),
      key: "teacher",
      render: (_: any, record: any) => {
        const teacher = record.teacherId;
        return (
          <Space>
            <UserOutlined />
            <span>{teacher?.name || t("studentReviews.unknown")}</span>
          </Space>
        );
      },
    },
    {
      title: t("studentReviews.rating"),
      dataIndex: "rating",
      key: "rating",
      render: (v: number) => <Rate disabled defaultValue={v} style={{ fontSize: 14 }} />,
    },
    {
      title: t("studentReviews.comment"),
      dataIndex: "text",
      key: "text",
      ellipsis: true,
      render: (v: string) => v || <em style={{ color: "#888" }}>{t("studentReviews.noComment")}</em>,
    },
    {
      title: t("studentReviews.date"),
      dataIndex: "createdAt",
      key: "createdAt",
      render: (v: string) => (v ? formatDate(v) : "—"),
    },
    {
      title: t("studentReviews.actions"),
      key: "actions",
      render: (_: any, record: any) => (
        <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleOpenEdit(record)}>
          {t("actions.edit")}
        </Button>
      ),
    },
  ];

  const modalTitle = editingReview
    ? t("studentReviews.editReview")
    : `${t("studentReviews.reviewPrefix")} ${selectedTeacher?.name || ""}`;
  const isSubmitting = createMutation.isPending || updateMutation.isPending;

  return (
    <Space direction="vertical" size="middle" style={{ width: "100%" }}>
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12}>
          <Card>
            <Statistic title={t("studentReviews.myReviews")} value={reviews.length} prefix={<StarOutlined />} />
          </Card>
        </Col>
        <Col xs={24} sm={12}>
          <Card>
            <Statistic title={t("studentReviews.eligibleTeachers")} value={eligibleTeachers.length} prefix={<UserOutlined />} />
          </Card>
        </Col>
      </Row>

      <Card title={t("studentReviews.teachersToReview")} loading={eligibleQuery.isLoading}>
        <Table
          dataSource={eligibleTeachers}
          columns={eligibleColumns}
          rowKey={(record) => record.id || record._id}
          pagination={{ pageSize: 5 }}
          locale={{ emptyText: t("studentReviews.noEligibleTeachers") }}
        />
      </Card>

      <Card title={t("studentReviews.myReviews")} loading={reviewsQuery.isLoading}>
        <Table
          dataSource={reviews}
          columns={reviewColumns}
          rowKey={(record) => record.id || record._id}
          pagination={{ pageSize: 10 }}
          locale={{ emptyText: t("studentReviews.noReviewsYet") }}
        />
      </Card>

      <Modal
        title={modalTitle}
        open={isModalOpen}
        onCancel={() => {
          setIsModalOpen(false);
          form.resetFields();
        }}
        footer={null}
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit} autoComplete="off">
          <Form.Item
            label={t("studentReviews.rating")}
            name="rating"
            rules={[{ required: true, message: t("studentReviews.ratingRequired") }]}
          >
            <Rate style={{ fontSize: 24 }} />
          </Form.Item>

          <Form.Item label={t("studentReviews.comment")} name="text">
            <Input.TextArea rows={4} placeholder={t("studentReviews.shareExperience")} maxLength={2000} showCount />
          </Form.Item>

          <Form.Item style={{ marginBottom: 0, textAlign: "right" }}>
            <Space>
              <Button onClick={() => { setIsModalOpen(false); form.resetFields(); }}>
                {t("actions.cancel")}
              </Button>
              <Button type="primary" htmlType="submit" loading={isSubmitting} icon={<SendOutlined />}>
                {editingReview ? t("studentReviews.update") : t("studentReviews.submit")}
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </Space>
  );
}
