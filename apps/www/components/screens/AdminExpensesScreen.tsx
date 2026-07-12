"use client";

import React, { useState } from "react";
import { useList, useCreate, useUpdate, useDelete } from "@refinedev/core";
import { Card, Table, Tag, Button, Space, Modal, Form, Input, InputNumber, Select, DatePicker, Popconfirm, message as antMessage } from "antd";
import { PlusOutlined, EditOutlined, DeleteOutlined, DollarOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { useI18n } from "@/components/providers/I18nProvider";

const CATEGORIES = ["rent", "utilities", "salaries", "supplies", "marketing", "maintenance", "other"] as const;
type Category = typeof CATEGORIES[number];

const categoryColor: Record<Category, string> = {
  rent: "blue",
  utilities: "cyan",
  salaries: "purple",
  supplies: "geekblue",
  marketing: "magenta",
  maintenance: "orange",
  other: "default",
};

type Expense = {
  _id?: string;
  id?: string;
  amount: number;
  category: Category;
  description?: string;
  expenseDate: string;
};

export function AdminExpensesScreen() {
  const { t, formatEGP, formatDate } = useI18n();
  const categoryLabel = (c: Category) => t(`adminManage.expenses.categories.${c}`);
  const { query, result } = useList<Expense>({ resource: "expenses", pagination: { mode: "off" } });
  const { mutate: createExpense, mutation: createMutation } = useCreate();
  const { mutate: updateExpense, mutation: updateMutation } = useUpdate();
  const { mutate: deleteExpense } = useDelete();

  const expenses = (result?.data ?? []) as Expense[];

  const [isOpen, setIsOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Expense | null>(null);
  const [form] = Form.useForm();

  const total = expenses.reduce((sum, e) => sum + (e.amount || 0), 0);

  const openCreate = () => {
    setEditTarget(null);
    form.resetFields();
    form.setFieldsValue({ expenseDate: dayjs(), category: "other" });
    setIsOpen(true);
  };

  const openEdit = (e: Expense) => {
    setEditTarget(e);
    form.setFieldsValue({
      amount: (e.amount ?? 0) / 100,
      category: e.category,
      description: e.description ?? "",
      expenseDate: dayjs(e.expenseDate),
    });
    setIsOpen(true);
  };

  const handleSubmit = (values: { amount: number; category: Category; description?: string; expenseDate: dayjs.Dayjs }) => {
    const payload = {
      amount: Math.round(values.amount * 100),
      category: values.category,
      description: values.description || undefined,
      expenseDate: values.expenseDate.format("YYYY-MM-DD"),
    };
    const onDone = () => {
      antMessage.success(editTarget ? t("adminManage.expenses.expenseUpdated") : t("adminManage.expenses.expenseRecorded"));
      setIsOpen(false);
      form.resetFields();
    };
    if (editTarget) {
      updateExpense(
        { resource: "expenses", id: editTarget.id || editTarget._id || "", values: payload },
        { onSuccess: onDone, onError: (err) => antMessage.error((err as { message?: string })?.message || t("adminManage.expenses.failed")) },
      );
    } else {
      createExpense(
        { resource: "expenses", values: payload },
        { onSuccess: onDone, onError: (err) => antMessage.error((err as { message?: string })?.message || t("adminManage.expenses.failed")) },
      );
    }
  };

  const handleDelete = (id: string) => {
    deleteExpense(
      { resource: "expenses", id },
      {
        onSuccess: () => antMessage.success(t("adminManage.expenses.expenseDeleted")),
        onError: (err) => antMessage.error((err as { message?: string })?.message || t("adminManage.expenses.deleteFailed")),
      },
    );
  };

  const columns = [
    {
      title: t("adminManage.expenses.date"),
      dataIndex: "expenseDate",
      key: "expenseDate",
      render: (v: string) => formatDate(v),
      sorter: (a: Expense, b: Expense) => dayjs(a.expenseDate).valueOf() - dayjs(b.expenseDate).valueOf(),
      defaultSortOrder: "descend" as const,
    },
    {
      title: t("adminManage.expenses.category"),
      dataIndex: "category",
      key: "category",
      render: (c: Category) => <Tag color={categoryColor[c]}>{categoryLabel(c)}</Tag>,
      filters: CATEGORIES.map((c) => ({ text: categoryLabel(c), value: c })),
      onFilter: (value: any, record: Expense) => record.category === value,
    },
    {
      title: t("adminManage.expenses.description"),
      dataIndex: "description",
      key: "description",
      render: (v?: string) => v || <span style={{ color: "#aaa" }}>—</span>,
    },
    {
      title: t("adminManage.expenses.amount"),
      dataIndex: "amount",
      key: "amount",
      render: (v: number) => <span style={{ fontWeight: 600 }}>{formatEGP(v)}</span>,
      sorter: (a: Expense, b: Expense) => (a.amount ?? 0) - (b.amount ?? 0),
      align: "right" as const,
    },
    {
      title: "",
      key: "actions",
      render: (_: unknown, record: Expense) => (
        <Space>
          <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(record)} />
          <Popconfirm
            title={t("adminManage.expenses.deleteConfirm")}
            onConfirm={() => handleDelete(record.id || record._id || "")}
            okText={t("actions.delete")}
            okButtonProps={{ danger: true }}
          >
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <Card
      title={
        <Space>
          <DollarOutlined />
          <span>{t("common.expenses")}</span>
          <span style={{ fontSize: 12, color: "#888", fontWeight: 400 }}>
            · {t("common.total")}: {formatEGP(total)}
          </span>
        </Space>
      }
      extra={
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
          {t("adminManage.expenses.recordExpense")}
        </Button>
      }
    >
      <Table
        dataSource={expenses}
        columns={columns}
        rowKey={(r) => r.id || r._id || ""}
        loading={query.isLoading}
        pagination={{ pageSize: 10 }}
        locale={{ emptyText: t("adminManage.expenses.noExpenses") }}
      />

      <Modal
        title={editTarget ? t("adminManage.expenses.editExpense") : t("adminManage.expenses.recordExpense")}
        open={isOpen}
        onCancel={() => { setIsOpen(false); form.resetFields(); }}
        onOk={() => form.submit()}
        confirmLoading={createMutation.isPending || updateMutation.isPending}
        okText={editTarget ? t("actions.save") : t("adminManage.expenses.record")}
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          <Form.Item
            name="amount"
            label={t("adminManage.expenses.amountEgp")}
            rules={[{ required: true, message: t("adminManage.expenses.amountRequired") }, { type: "number", min: 0.01, message: t("adminManage.expenses.amountPositive") }]}
          >
            <InputNumber style={{ width: "100%" }} min={0.01} step={1} precision={2} prefix="EGP" />
          </Form.Item>
          <Form.Item
            name="category"
            label={t("adminManage.expenses.category")}
            rules={[{ required: true, message: t("adminManage.expenses.categoryRequired") }]}
          >
            <Select options={CATEGORIES.map((c) => ({ label: categoryLabel(c), value: c }))} />
          </Form.Item>
          <Form.Item name="description" label={t("adminManage.expenses.description")}>
            <Input.TextArea rows={2} maxLength={300} placeholder={t("adminManage.expenses.optionalDetails")} />
          </Form.Item>
          <Form.Item
            name="expenseDate"
            label={t("adminManage.expenses.date")}
            rules={[{ required: true, message: t("adminManage.expenses.dateRequired") }]}
          >
            <DatePicker style={{ width: "100%" }} format="YYYY-MM-DD" />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
}
