"use client";

import React, { useMemo } from "react";
import { useList } from "@refinedev/core";
import { api } from "@/lib/api/client";
import {
  Table,
  Card,
  Button,
  Space,
  Tag,
  message,
} from "antd";
import { DownloadOutlined, FilePdfOutlined } from "@ant-design/icons";
import { useI18n } from "@/components/providers/I18nProvider";

const MATERIAL_TYPE_OPTIONS = [
  { value: "lecture", label: "Lecture" },
  { value: "homework", label: "Homework" },
  { value: "exam", label: "Exam" },
  { value: "other", label: "Other" },
];

const TYPE_COLORS: Record<string, string> = {
  lecture: "blue",
  homework: "orange",
  exam: "red",
  other: "default",
};

function formatBytes(bytes: number | null): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function StudentMaterialsScreen() {
  const { t, formatDate } = useI18n();
  const { query: enrollmentsQuery, result: enrollmentsResult } = useList({ resource: "enrollments" });
  const { query: materialsQuery, result: materialsResult } = useList({ resource: "materials" });

  const enrollments = (enrollmentsResult?.data ?? []) as any[];
  const materials = (materialsResult?.data ?? []) as any[];

  const courseMap = useMemo(() => {
    const map = new Map<string, string>();
    enrollments.forEach((e) => {
      const cid = e.courseId?.toString?.() || e.courseId;
      if (cid && e.courseName) map.set(cid, e.courseName);
    });
    return map;
  }, [enrollments]);

  const handleDownload = async (id: string) => {
    try {
      const response = await api.get(`materials/${id}/download`).json<{ data: { url: string } }>();
      window.open(response.data.url, "_blank");
    } catch (err: any) {
      message.error(err?.message || t("studentMaterials.downloadFailed"));
    }
  };

  const columns = [
    {
      title: t("studentMaterials.title"),
      dataIndex: "title",
      key: "title",
      render: (v: string) => (
        <Space>
          <FilePdfOutlined style={{ color: "#cf1322" }} />
          <span>{v}</span>
        </Space>
      ),
    },
    {
      title: t("studentMaterials.course"),
      key: "course",
      render: (_: any, record: any) => courseMap.get(record.courseId?.toString?.()) || "—",
    },
    {
      title: t("studentMaterials.type"),
      dataIndex: "type",
      key: "type",
      render: (v: string) => <Tag color={TYPE_COLORS[v] || "default"}>{v ? t(`studentMaterials.types.${v}`) : "—"}</Tag>,
    },
    {
      title: t("studentMaterials.size"),
      dataIndex: "fileSizeBytes",
      key: "size",
      render: (v: number) => formatBytes(v),
    },
    {
      title: t("studentMaterials.uploaded"),
      dataIndex: "createdAt",
      key: "createdAt",
      render: (v: string) => (v ? formatDate(v) : "—"),
    },
    {
      title: t("studentMaterials.actions"),
      key: "actions",
      render: (_: any, record: any) => {
        const id = record.id || record._id;
        return (
          <Button
            type="primary"
            size="small"
            icon={<DownloadOutlined />}
            onClick={() => handleDownload(id)}
          >
            {t("studentMaterials.download")}
          </Button>
        );
      },
    },
  ];

  return (
    <Card
      title={t("studentMaterials.pageTitle")}
      loading={materialsQuery.isLoading || enrollmentsQuery.isLoading}
    >
      <Table
        dataSource={materials}
        columns={columns}
        rowKey={(record) => record.id || record._id}
        pagination={{ pageSize: 10 }}
        locale={{ emptyText: t("studentMaterials.noMaterials") }}
      />
    </Card>
  );
}
