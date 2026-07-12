"use client";

import React, { useState } from "react";
import { useList, useCreate, useUpdate, useDelete } from "@refinedev/core";
import {
  Table,
  Card,
  Button,
  Space,
  Statistic,
  Row,
  Col,
  Modal,
  Form,
  Input,
  InputNumber,
  Popconfirm,
  message,
} from "antd";
import { PlusOutlined, HomeOutlined, EditOutlined, DeleteOutlined } from "@ant-design/icons";
import { useI18n } from "@/components/providers/I18nProvider";

export function AdminRoomsScreen() {
  const { t, formatDate } = useI18n();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form] = Form.useForm();

  const { query, result } = useList({ resource: "rooms" });
  const { mutate: createRoom, mutation: createMutation } = useCreate();
  const { mutate: updateRoom, mutation: updateMutation } = useUpdate();
  const { mutate: deleteRoom, mutation: deleteMutation } = useDelete();

  const rooms = (result?.data ?? []) as any[];

  const handleOpenCreate = () => {
    setEditingId(null);
    form.resetFields();
    setIsModalOpen(true);
  };

  const handleOpenEdit = (room: any) => {
    setEditingId(room.id || room._id);
    form.setFieldsValue({
      name: room.name,
      capacity: room.capacity,
    });
    setIsModalOpen(true);
  };

  const handleSubmit = (values: { name: string; capacity?: number }) => {
    if (editingId) {
      updateRoom(
        { resource: "rooms", id: editingId, values },
        {
          onSuccess: () => {
            message.success(t("adminManage.rooms.roomUpdated"));
            setIsModalOpen(false);
            form.resetFields();
          },
          onError: (err: any) => {
            message.error(err?.message || t("adminManage.rooms.failedUpdate"));
          },
        }
      );
    } else {
      createRoom(
        { resource: "rooms", values },
        {
          onSuccess: () => {
            message.success(t("adminManage.rooms.roomCreated"));
            setIsModalOpen(false);
            form.resetFields();
          },
          onError: (err: any) => {
            message.error(err?.message || t("adminManage.rooms.failedCreate"));
          },
        }
      );
    }
  };

  const handleDelete = (id: string) => {
    deleteRoom(
      { resource: "rooms", id },
      {
        onSuccess: () => {
          message.success(t("adminManage.rooms.roomDeleted"));
        },
        onError: (err: any) => {
          message.error(err?.message || t("adminManage.rooms.failedDelete"));
        },
      }
    );
  };

  const columns = [
    {
      title: t("adminManage.rooms.colName"),
      dataIndex: "name",
      key: "name",
    },
    {
      title: t("adminManage.rooms.capacity"),
      dataIndex: "capacity",
      key: "capacity",
      render: (v: number | null) => v ?? "—",
    },
    {
      title: t("adminManage.rooms.colCreated"),
      dataIndex: "createdAt",
      key: "createdAt",
      render: (v: string) => (v ? formatDate(v) : "—"),
    },
    {
      title: t("adminManage.rooms.colActions"),
      key: "actions",
      render: (_: any, record: any) => {
        const id = record.id || record._id;
        return (
          <Space>
            <Button
              type="link"
              size="small"
              icon={<EditOutlined />}
              onClick={() => handleOpenEdit(record)}
            >
              {t("actions.edit")}
            </Button>
            <Popconfirm
              title={t("adminManage.rooms.deleteRoomTitle")}
              description={t("adminManage.rooms.deleteRoomDescription")}
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

  const modalTitle = editingId ? t("adminManage.rooms.editRoom") : t("adminManage.rooms.addRoom");
  return (
    <Space direction="vertical" size="middle" style={{ width: "100%" }}>
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={8}>
          <Card>
            <Statistic
              title={t("adminManage.rooms.totalRooms")}
              value={rooms.length}
              prefix={<HomeOutlined />}
            />
          </Card>
        </Col>
      </Row>

      <Card
        title={t("nav.rooms")}
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={handleOpenCreate}>
            {t("adminManage.rooms.addRoom")}
          </Button>
        }
      >
        <Table
          dataSource={rooms}
          columns={columns}
          rowKey={(record) => record.id || record._id}
          loading={query.isLoading}
          pagination={{ pageSize: 10 }}
          locale={{ emptyText: t("adminManage.rooms.emptyText") }}
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
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
          autoComplete="off"
        >
          <Form.Item
            label={t("adminManage.rooms.roomName")}
            name="name"
            rules={[{ required: true, message: t("adminManage.rooms.roomNameRequired") }]}
          >
            <Input placeholder={t("adminManage.rooms.roomNamePlaceholder")} />
          </Form.Item>

          <Form.Item label={t("adminManage.rooms.capacity")} name="capacity">
            <InputNumber min={1} placeholder={t("adminManage.rooms.capacityPlaceholder")} style={{ width: "100%" }} />
          </Form.Item>

          <Form.Item style={{ marginBottom: 0, textAlign: "right" }}>
            <Space>
              <Button
                onClick={() => {
                  setIsModalOpen(false);
                  form.resetFields();
                }}
              >
                {t("actions.cancel")}
              </Button>
              <Button type="primary" htmlType="submit" loading={createMutation.isPending || updateMutation.isPending}>
                {editingId ? t("adminManage.rooms.update") : t("adminManage.rooms.create")}
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </Space>
  );
}
