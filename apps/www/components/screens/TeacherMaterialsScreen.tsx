"use client";

import React, { useState, useMemo } from "react";
import { useList, useDelete } from "@refinedev/core";
import { api } from "@/lib/api/client";
import {
  Table,
  Card,
  Button,
  Space,
  Modal,
  Form,
  Input,
  Select,
  Popconfirm,
  Tag,
  message,
  Upload,
  Radio,
  Alert,
} from "antd";
import { PlusOutlined, UploadOutlined, DeleteOutlined, DownloadOutlined, FilePdfOutlined } from "@ant-design/icons";
import { useI18n } from "@/components/providers/I18nProvider";

const MATERIAL_TYPE_VALUES = ["lecture", "homework", "exam", "other"] as const;

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

export function TeacherMaterialsScreen() {
  const { t, formatDate } = useI18n();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [sourceMode, setSourceMode] = useState<"upload" | "link">("upload");
  const [form] = Form.useForm();

  const { query: coursesQuery, result: coursesResult } = useList({ resource: "courses" });
  const { query: materialsQuery, result: materialsResult } = useList({
    resource: "materials",
    filters: selectedCourseId ? [{ field: "courseId", operator: "eq" as const, value: selectedCourseId }] : [],
  });
  const { mutate: deleteMaterial, mutation: deleteMutation } = useDelete();

  const courses = (coursesResult?.data ?? []) as any[];
  const materials = (materialsResult?.data ?? []) as any[];

  const materialTypeOptions = MATERIAL_TYPE_VALUES.map((v) => ({ value: v, label: t(`teacher.type_${v}`) }));

  const courseMap = useMemo(() => {
    const map = new Map<string, string>();
    courses.forEach((c) => map.set(c.id || c._id, c.title));
    return map;
  }, [courses]);

  const courseOptions = useMemo(
    () => courses.map((c) => ({ value: c.id || c._id, label: c.title })),
    [courses]
  );

  const handleUpload = async (values: { courseId: string; title: string; type: string; fileUrl?: string }) => {
    let file: File | undefined;
    if (sourceMode === "upload") {
      const rawFileList = form.getFieldValue("file");
      const fileList = Array.isArray(rawFileList) ? rawFileList : rawFileList?.fileList;
      file = fileList?.[0]?.originFileObj;
      if (!file) {
        message.error(t("teacher.selectPdfError"));
        return;
      }
      if (file.type !== "application/pdf") {
        message.error(t("teacher.onlyPdfError"));
        return;
      }
    } else if (!values.fileUrl?.trim()) {
      message.error(t("teacher.enterLinkError"));
      return;
    }

    const formData = new FormData();
    formData.append("courseId", values.courseId);
    formData.append("title", values.title);
    formData.append("type", values.type);
    if (sourceMode === "upload" && file) {
      formData.append("file", file);
    } else {
      formData.append("fileUrl", values.fileUrl!.trim());
    }

    setUploading(true);
    try {
      await api.post("materials", { body: formData });
      message.success(t("teacher.uploadSuccess"));
      setIsModalOpen(false);
      setSourceMode("upload");
      form.resetFields();
      materialsQuery.refetch();
    } catch (err: any) {
      message.error(err?.message || t("teacher.uploadFailed"));
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = (id: string) => {
    deleteMaterial(
      { resource: "materials", id },
      {
        onSuccess: () => message.success(t("teacher.deleteSuccess")),
        onError: (err: any) => message.error(err?.message || t("teacher.deleteFailed")),
      }
    );
  };

  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const handleDownload = async (id: string) => {
    setDownloadingId(id);
    try {
      const response = await api.get(`materials/${id}/download`).json<{ data: { url: string } }>();
      window.open(response.data.url, "_blank");
    } catch (err: any) {
      message.error(err?.message || t("teacher.downloadFailed"));
    } finally {
      setDownloadingId(null);
    }
  };

  const columns = [
    {
      title: t("teacher.title"),
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
      title: t("nav.courses"),
      key: "course",
      render: (_: any, record: any) => courseMap.get(record.courseId?.toString?.()) || "—",
    },
    {
      title: t("teacher.type"),
      dataIndex: "type",
      key: "type",
      render: (v: string) => <Tag color={TYPE_COLORS[v] || "default"}>{v ? t(`teacher.type_${v}`) : ""}</Tag>,
    },
    {
      title: t("teacher.size"),
      dataIndex: "fileSizeBytes",
      key: "size",
      render: (v: number) => formatBytes(v),
    },
    {
      title: t("teacher.uploaded"),
      dataIndex: "createdAt",
      key: "createdAt",
      render: (v: string) => (v ? formatDate(v) : "—"),
    },
    {
      title: t("teacher.actions"),
      key: "actions",
      render: (_: any, record: any) => {
        const id = record.id || record._id;
        return (
          <Space>
            <Button type="link" size="small" icon={<DownloadOutlined />} onClick={() => handleDownload(id)} loading={downloadingId === id}>
              {t("teacher.download")}
            </Button>
            <Popconfirm
              title={t("teacher.deleteConfirm")}
              onConfirm={() => handleDelete(id)}
              okButtonProps={{ loading: deleteMutation.isPending, danger: true }}
            >
              <Button type="link" danger size="small" icon={<DeleteOutlined />}>
                {t("actions.delete")}
              </Button>
            </Popconfirm>
          </Space>
        );
      },
    },
  ];

  return (
    <Space direction="vertical" size="middle" style={{ width: "100%" }}>
      <Card
        title={t("teacher.materialsHeading")}
        extra={
          <Space>
            <Select
              placeholder={t("teacher.filterByCourse")}
              allowClear
              style={{ width: 200 }}
              options={courseOptions}
              value={selectedCourseId}
              onChange={setSelectedCourseId}
              loading={coursesQuery.isLoading}
            />
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setIsModalOpen(true)}>
              {t("teacher.uploadMaterial")}
            </Button>
          </Space>
        }
      >
        <Table
          dataSource={materials}
          columns={columns}
          rowKey={(record) => record.id || record._id}
          loading={materialsQuery.isLoading}
          pagination={{ pageSize: 10 }}
          locale={{ emptyText: t("teacher.noMaterials") }}
        />
      </Card>

      <Modal
        title={t("teacher.uploadMaterial")}
        open={isModalOpen}
        onCancel={() => {
          setIsModalOpen(false);
          setSourceMode("upload");
          form.resetFields();
        }}
        footer={null}
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={handleUpload} autoComplete="off">
          <Alert
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
            message={t("teacher.pdfStorage")}
            description={t("teacher.pdfStorageDesc")}
          />

          <Form.Item
            label={t("teacher.course")}
            name="courseId"
            rules={[{ required: true, message: t("teacher.selectCourseRequired") }]}
          >
            <Select placeholder={t("teacher.selectCoursePlaceholder")} options={courseOptions} loading={coursesQuery.isLoading} />
          </Form.Item>

          <Form.Item
            label={t("teacher.title")}
            name="title"
            rules={[{ required: true, message: t("teacher.titleRequired") }]}
          >
            <Input placeholder={t("teacher.titlePlaceholder")} />
          </Form.Item>

          <Form.Item
            label={t("teacher.type")}
            name="type"
            rules={[{ required: true, message: t("teacher.typeRequired") }]}
          >
            <Select placeholder={t("teacher.selectTypePlaceholder")} options={materialTypeOptions} />
          </Form.Item>

          <Form.Item label={t("teacher.source")}>
            <Radio.Group
              value={sourceMode}
              onChange={(event) => {
                setSourceMode(event.target.value);
                form.setFieldsValue({ file: undefined, fileUrl: undefined });
              }}
              optionType="button"
              buttonStyle="solid"
            >
              <Radio.Button value="upload">{t("teacher.uploadPdf")}</Radio.Button>
              <Radio.Button value="link">{t("teacher.pdfLink")}</Radio.Button>
            </Radio.Group>
          </Form.Item>

          {sourceMode === "upload" ? (
            <Form.Item
              label={t("teacher.fileLabel")}
              name="file"
              rules={[{ required: true, message: t("teacher.fileRequired") }]}
              valuePropName="fileList"
              getValueFromEvent={(e) => (Array.isArray(e) ? e : e?.fileList)}
              extra={(() => {
                const rawFileList = form.getFieldValue("file");
                const fileList = Array.isArray(rawFileList) ? rawFileList : rawFileList?.fileList;
                const f = fileList?.[0]?.originFileObj;
                if (!f) return undefined;
                const size = f.size < 1024 * 1024
                  ? `${(f.size / 1024).toFixed(1)} KB`
                  : `${(f.size / (1024 * 1024)).toFixed(1)} MB`;
                const tooLarge = f.size > 20 * 1024 * 1024;
                return (
                  <span style={{ color: tooLarge ? "#cf1322" : "#888" }}>
                    {f.name} — {size}{tooLarge ? ` ${t("teacher.tooLarge")}` : ""}
                  </span>
                );
              })()}
            >
              <Upload beforeUpload={() => false} accept=".pdf,application/pdf" maxCount={1}>
                <Button icon={<UploadOutlined />}>{t("teacher.selectPdf")}</Button>
              </Upload>
            </Form.Item>
          ) : (
            <Form.Item
              label={t("teacher.pdfLinkLabel")}
              name="fileUrl"
              rules={[
                { required: true, message: t("teacher.pdfLinkRequired") },
                { type: "url", message: t("teacher.validUrl") },
              ]}
            >
              <Input placeholder="https://example.com/material.pdf" />
            </Form.Item>
          )}

          <Form.Item style={{ marginBottom: 0, textAlign: "right" }}>
            <Space>
              <Button onClick={() => { setIsModalOpen(false); setSourceMode("upload"); form.resetFields(); }}>
                {t("actions.cancel")}
              </Button>
              <Button type="primary" htmlType="submit" loading={uploading}>
                {t("teacher.upload")}
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </Space>
  );
}
