"use client";

import React, { useState } from "react";
import { useList, useCustomMutation, useCreate, useUpdate, useInvalidate } from "@refinedev/core";
import { Table, Card, Input, Button, Tag, Space, Progress, Modal, message as antMessage, Form, InputNumber, Select, DatePicker, TimePicker, Row, Col } from "antd";
import { SearchOutlined, PlusOutlined, DeleteOutlined, EditOutlined, BookOutlined, FilterOutlined, EyeOutlined } from "@ant-design/icons";
import Link from "next/link";
import dayjs from "dayjs";
import { useI18n } from "@/components/providers/I18nProvider";

type CreateValues = {
  title: string;
  subject: string;
  description?: string;
  gradeTag?: string;
  teacherId: string;
  defaultRoomId?: string;
  daysOfWeek: number[];
  startTime: dayjs.Dayjs;
  endTime: dayjs.Dayjs;
  dateRange: [dayjs.Dayjs, dayjs.Dayjs];
  price: number;
  maxStudents: number;
};

type EditValues = Omit<CreateValues, "subject" | "teacherId">;

export function AdminClassesScreen() {
  const { t, formatEGP } = useI18n();
  const { query, result } = useList({ resource: "courses" });
  const { result: teachersResult } = useList({ resource: "teachers", pagination: { mode: "off" } });
  const { result: roomsResult } = useList({ resource: "rooms", pagination: { mode: "off" } });
  const { mutate: cancelCourse, mutation: cancelMutation } = useCustomMutation();
  const { mutate: createCourse, mutation: createMutation } = useCreate();
  const { mutate: updateCourse, mutation: updateMutation } = useUpdate();
  const invalidate = useInvalidate();
  const [search, setSearch] = useState("");
  const [subjectFilter, setSubjectFilter] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [teacherFilter, setTeacherFilter] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<{ id: string; title: string } | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createForm] = Form.useForm<CreateValues>();
  const [editTarget, setEditTarget] = useState<any | null>(null);
  const [editForm] = Form.useForm<EditValues>();

  const dayLabels = [
    t("adminManage.classes.daySun"),
    t("adminManage.classes.dayMon"),
    t("adminManage.classes.dayTue"),
    t("adminManage.classes.dayWed"),
    t("adminManage.classes.dayThu"),
    t("adminManage.classes.dayFri"),
    t("adminManage.classes.daySat"),
  ];
  const dayOptions = dayLabels.map((label, value) => ({ label, value }));

  const teachers = (teachersResult?.data ?? []) as any[];
  const rooms = (roomsResult?.data ?? []) as any[];
  const activeTeachers = teachers.filter((t) => t.status === "active");

  const handleCreate = (values: CreateValues) => {
    const payload = {
      title: values.title.trim(),
      subject: values.subject.trim(),
      description: values.description?.trim() || undefined,
      gradeTag: values.gradeTag?.trim() || undefined,
      teacherId: values.teacherId,
      defaultRoomId: values.defaultRoomId || undefined,
      schedulePattern: {
        daysOfWeek: values.daysOfWeek,
        startTime: values.startTime.format("HH:mm"),
        endTime: values.endTime.format("HH:mm"),
        startDate: values.dateRange[0].format("YYYY-MM-DD"),
        endDate: values.dateRange[1].format("YYYY-MM-DD"),
      },
      price: Math.round(values.price * 100),
      maxStudents: values.maxStudents,
    };
    createCourse(
      { resource: "courses", values: payload },
      {
        onSuccess: () => {
          antMessage.success(`${t("adminManage.classes.courseCreated")}: "${payload.title}"`);
          setIsCreateOpen(false);
          createForm.resetFields();
          invalidate({ resource: "courses", invalidates: ["list"] });
        },
        onError: (err) => {
          antMessage.error((err as { message?: string })?.message || t("adminManage.classes.failedCreate"));
        },
      },
    );
  };

  const courses = (result?.data ?? []) as any[];

  // Extract unique subjects for filter dropdown
  const subjects = [...new Set(courses.map((c: any) => c.subject).filter(Boolean))].sort();

  const filtered = courses.filter((c: any) => {
    const matchesSearch = !search ||
      (c.title || "").toLowerCase().includes(search.toLowerCase()) ||
      (c.teacherName || "").toLowerCase().includes(search.toLowerCase());
    const matchesSubject = !subjectFilter || c.subject === subjectFilter;
    const matchesStatus = !statusFilter || (c.status || "active") === statusFilter;
    const matchesTeacher = !teacherFilter || c.teacherName === teacherFilter;
    return matchesSearch && matchesSubject && matchesStatus && matchesTeacher;
  });

  const openEdit = (course: any) => {
    setEditTarget(course);
    editForm.setFieldsValue({
      title: course.title || "",
      gradeTag: course.gradeTag || "",
      description: course.description || "",
      defaultRoomId: course.defaultRoomId || undefined,
      daysOfWeek: course.schedulePattern?.daysOfWeek ?? [],
      startTime: course.schedulePattern?.startTime ? dayjs(course.schedulePattern.startTime, "HH:mm") : null as any,
      endTime: course.schedulePattern?.endTime ? dayjs(course.schedulePattern.endTime, "HH:mm") : null as any,
      dateRange: [
        course.schedulePattern?.startDate ? dayjs(course.schedulePattern.startDate) : null,
        course.schedulePattern?.endDate ? dayjs(course.schedulePattern.endDate) : null,
      ] as any,
      price: (course.price ?? 0) / 100,
      maxStudents: course.maxStudents ?? 1,
    });
  };

  const handleEdit = (values: EditValues) => {
    if (!editTarget) return;
    const id = editTarget.id || editTarget._id;
    const payload = {
      title: values.title.trim(),
      gradeTag: values.gradeTag?.trim() || undefined,
      description: values.description?.trim() || undefined,
      defaultRoomId: values.defaultRoomId || undefined,
      schedulePattern: {
        daysOfWeek: values.daysOfWeek,
        startTime: values.startTime.format("HH:mm"),
        endTime: values.endTime.format("HH:mm"),
        startDate: values.dateRange[0].format("YYYY-MM-DD"),
        endDate: values.dateRange[1].format("YYYY-MM-DD"),
      },
      price: Math.round(values.price * 100),
      maxStudents: values.maxStudents,
    };
    updateCourse(
      { resource: "courses", id, values: payload },
      {
        onSuccess: () => {
          antMessage.success(`${t("adminManage.classes.courseUpdated")}: "${payload.title}"`);
          setEditTarget(null);
          editForm.resetFields();
          invalidate({ resource: "courses", invalidates: ["list"] });
        },
        onError: (err) => {
          antMessage.error((err as { message?: string })?.message || t("adminManage.classes.failedUpdate"));
        },
      },
    );
  };

  const handleCancelSubmit = () => {
    if (!cancelTarget || !cancelReason.trim()) return;
    cancelCourse(
      {
        url: `courses/${cancelTarget.id}/cancel`,
        method: "post",
        values: { reason: cancelReason.trim() },
      },
      {
        onSuccess: () => {
          antMessage.success(`${t("adminManage.classes.courseCancelled")}: "${cancelTarget.title}"`);
          setCancelTarget(null);
          setCancelReason("");
          invalidate({ resource: "courses", invalidates: ["list"] });
        },
        onError: (err) => {
          antMessage.error((err as { message?: string })?.message || t("adminManage.classes.failedCancel"));
        },
      },
    );
  };

  const mapDays = (days: number[] = []) => {
    return days.map((d) => dayLabels[d] || t("adminManage.classes.unknown")).join(", ");
  };

  const statusLabel = (status: string) => {
    switch (status) {
      case "active":
        return t("status.active");
      case "cancelled":
        return t("status.cancelled");
      case "completed":
        return t("status.completed");
      case "ended":
        return t("adminManage.classes.ended");
      default:
        return status.charAt(0).toUpperCase() + status.slice(1);
    }
  };

  const columns = [
    {
      title: t("adminManage.classes.colCourse"),
      key: "course",
      render: (_: any, record: any) => (
        <Space>
          <BookOutlined style={{ color: "#0fa5e9" }} />
          <span style={{ fontWeight: 600 }}>{record.title}</span>
        </Space>
      ),
    },
    {
      title: t("roles.teacher"),
      dataIndex: "teacherName",
      key: "teacherName",
      render: (v: string) => v || t("adminManage.classes.unassigned"),
    },
    {
      title: t("adminManage.classes.colSchedule"),
      key: "schedule",
      render: (_: any, record: any) => {
        const days = record.schedulePattern?.daysOfWeek;
        const start = record.schedulePattern?.startTime;
        const end = record.schedulePattern?.endTime;
        return `${mapDays(days)} · ${start || "?"} - ${end || "?"}`;
      },
    },
    {
      title: t("adminManage.classes.colRoom"),
      dataIndex: "roomName",
      key: "roomName",
      render: (v: string) => v || t("adminManage.classes.tbd"),
    },
    {
      title: t("adminManage.classes.colPrice"),
      key: "price",
      render: (_: any, record: any) => formatEGP(record.price),
    },
    {
      title: t("adminManage.classes.colCapacity"),
      key: "capacity",
      render: (_: any, record: any) => {
        const enrolled = record.enrolledStudentsCount || 0;
        const max = record.maxStudents || 1;
        const pct = Math.min(100, (enrolled / max) * 100);
        return (
          <Space direction="vertical" size={0} style={{ width: 120 }}>
            <span style={{ fontSize: 12 }}>
              {enrolled}/{max}
            </span>
            <Progress percent={Math.round(pct)} size="small" showInfo={false} />
          </Space>
        );
      },
    },
    {
      title: t("adminManage.classes.colStatus"),
      key: "status",
      render: (_: any, record: any) => {
        const status = record.status || "active";
        return <Tag color={status === "active" ? "green" : "default"}>{statusLabel(status)}</Tag>;
      },
    },
    {
      title: t("adminManage.classes.colActions"),
      key: "actions",
      render: (_: any, record: any) => (
        <Space>
          <Link href={`/courses/${record.id || record._id}`}>
            <Button type="link" size="small" icon={<EyeOutlined />}>
              {t("adminManage.classes.view")}
            </Button>
          </Link>
          <Button
            type="link"
            size="small"
            icon={<EditOutlined />}
            disabled={record.status === "cancelled"}
            onClick={() => openEdit(record)}
          >
            {t("actions.edit")}
          </Button>
          <Button
            type="link"
            danger
            size="small"
            icon={<DeleteOutlined />}
            disabled={record.status === "cancelled"}
            onClick={() => {
              setCancelTarget({ id: record.id || record._id, title: record.title });
              setCancelReason("");
            }}
          >
            {t("actions.cancel")}
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <Space direction="vertical" size="middle" style={{ width: "100%" }}>
      <Card
        title={t("adminManage.classes.title")}
        extra={
          <Space>
            <Input
              prefix={<SearchOutlined />}
              placeholder={t("adminManage.classes.searchPlaceholder")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ width: 200 }}
              allowClear
            />
            <Button
              icon={<FilterOutlined />}
              onClick={() => setShowFilters(!showFilters)}
            >
              {t("adminManage.classes.filters")}
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setIsCreateOpen(true)}>
              {t("adminManage.classes.createCourse")}
            </Button>
          </Space>
        }
      >
        {showFilters && (
          <Row gutter={[16, 12]} style={{ marginBottom: 16 }}>
            <Col xs={24} sm={8}>
              <div style={{ fontSize: 12, color: "#888", marginBottom: 4 }}>{t("adminManage.classes.subject")}</div>
              <Select
                allowClear
                placeholder={t("adminManage.classes.allSubjects")}
                value={subjectFilter}
                onChange={setSubjectFilter}
                style={{ width: "100%" }}
                options={subjects.map((s) => ({ value: s, label: s }))}
              />
            </Col>
            <Col xs={24} sm={8}>
              <div style={{ fontSize: 12, color: "#888", marginBottom: 4 }}>{t("adminManage.classes.status")}</div>
              <Select
                allowClear
                placeholder={t("adminManage.classes.allStatuses")}
                value={statusFilter}
                onChange={setStatusFilter}
                style={{ width: "100%" }}
                options={[
                  { value: "active", label: t("status.active") },
                  { value: "ended", label: t("adminManage.classes.ended") },
                  { value: "cancelled", label: t("status.cancelled") },
                ]}
              />
            </Col>
            <Col xs={24} sm={8}>
              <div style={{ fontSize: 12, color: "#888", marginBottom: 4 }}>{t("roles.teacher")}</div>
              <Select
                allowClear
                showSearch
                placeholder={t("adminManage.classes.allTeachers")}
                value={teacherFilter}
                onChange={setTeacherFilter}
                style={{ width: "100%" }}
                optionFilterProp="label"
                options={[...new Set(courses.map((c: any) => c.teacherName).filter(Boolean))].sort().map((t) => ({ value: t, label: t }))}
              />
            </Col>
          </Row>
        )}
        <Table
        dataSource={filtered}
        columns={columns}
        rowKey={(record) => record.id || record._id}
        loading={query.isLoading}
        pagination={{ pageSize: 10 }}
        locale={{ emptyText: t("adminManage.classes.emptyText") }}
      />

      <Modal
        title={cancelTarget ? `${t("actions.cancel")} "${cancelTarget.title}"?` : t("adminManage.classes.cancelCourse")}
        open={!!cancelTarget}
        onCancel={() => { setCancelTarget(null); setCancelReason(""); }}
        onOk={handleCancelSubmit}
        okText={t("adminManage.classes.cancelCourse")}
        okButtonProps={{ danger: true, loading: cancelMutation.isPending, disabled: !cancelReason.trim() }}
        cancelText={t("adminManage.classes.keepActive")}
      >
        <p>{t("adminManage.classes.cancelWarning")}</p>
        <Input.TextArea
          placeholder={t("adminManage.classes.cancelReasonPlaceholder")}
          rows={3}
          value={cancelReason}
          onChange={(e) => setCancelReason(e.target.value)}
        />
      </Modal>

      <Modal
        title={t("adminManage.classes.createCourseTitle")}
        open={isCreateOpen}
        onCancel={() => { setIsCreateOpen(false); createForm.resetFields(); }}
        onOk={() => createForm.submit()}
        confirmLoading={createMutation.isPending}
        okText={t("adminManage.classes.create")}
        width={680}
        destroyOnClose
      >
        {activeTeachers.length === 0 && (
          <p style={{ color: "#cf1322", marginTop: 0 }}>
            {t("adminManage.classes.noActiveTeachers")}
          </p>
        )}
        <Form
          form={createForm}
          layout="vertical"
          onFinish={handleCreate}
          initialValues={{
            maxStudents: 20,
            price: 500,
          }}
        >
          <Row gutter={16}>
            <Col span={14}>
              <Form.Item name="title" label={t("adminManage.classes.fieldTitle")} rules={[{ required: true, message: t("adminManage.classes.titleRequired") }]}>
                <Input placeholder={t("adminManage.classes.titlePlaceholder")} />
              </Form.Item>
            </Col>
            <Col span={10}>
              <Form.Item name="subject" label={t("adminManage.classes.subject")} rules={[{ required: true, message: t("adminManage.classes.subjectRequired") }]}>
                <Input placeholder={t("adminManage.classes.subjectPlaceholder")} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={14}>
              <Form.Item
                name="teacherId"
                label={t("roles.teacher")}
                rules={[{ required: true, message: t("adminManage.classes.teacherRequired") }]}
              >
                <Select
                  placeholder={t("adminManage.classes.selectTeacher")}
                  options={activeTeachers.map((tch: any) => ({
                    label: tch.name || tch.email || t("adminManage.classes.unknown"),
                    value: tch.teacherId,
                  }))}
                  showSearch
                  optionFilterProp="label"
                />
              </Form.Item>
            </Col>
            <Col span={10}>
              <Form.Item name="defaultRoomId" label={t("adminManage.classes.roomOptional")}>
                <Select
                  allowClear
                  placeholder={t("adminManage.classes.selectRoom")}
                  options={rooms.map((r: any) => ({
                    label: `${r.name}${r.capacity ? ` · ${t("adminManage.classes.capLabel")} ${r.capacity}` : ""}`,
                    value: r.id || r._id,
                  }))}
                />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item
            name="daysOfWeek"
            label={t("adminManage.classes.daysOfWeek")}
            rules={[{ required: true, message: t("adminManage.classes.pickAtLeastOneDay") }]}
          >
            <Select mode="multiple" options={dayOptions} placeholder={t("adminManage.classes.pickDays")} />
          </Form.Item>
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="startTime" label={t("adminManage.classes.startTime")} rules={[{ required: true, message: t("adminManage.classes.required") }]}>
                <TimePicker style={{ width: "100%" }} format="HH:mm" minuteStep={5} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="endTime" label={t("adminManage.classes.endTime")} rules={[{ required: true, message: t("adminManage.classes.required") }]}>
                <TimePicker style={{ width: "100%" }} format="HH:mm" minuteStep={5} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="gradeTag" label={t("adminManage.classes.gradeTagOptional")}>
                <Input placeholder={t("adminManage.classes.gradeTagPlaceholder")} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item
            name="dateRange"
            label={t("adminManage.classes.term")}
            rules={[{ required: true, message: t("adminManage.classes.termDatesRequired") }]}
          >
            <DatePicker.RangePicker style={{ width: "100%" }} format="YYYY-MM-DD" />
          </Form.Item>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="price"
                label={t("adminManage.classes.priceEGP")}
                rules={[{ required: true, message: t("adminManage.classes.priceRequired") }, { type: "number", min: 0, message: t("adminManage.classes.mustBeZeroOrMore") }]}
              >
                <InputNumber style={{ width: "100%" }} min={0} step={50} precision={2} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="maxStudents"
                label={t("adminManage.classes.maxStudents")}
                rules={[{ required: true, message: t("adminManage.classes.required") }, { type: "number", min: 1, message: t("adminManage.classes.mustBeOneOrMore") }]}
              >
                <InputNumber style={{ width: "100%" }} min={1} step={1} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="description" label={t("adminManage.classes.descriptionOptional")}>
            <Input.TextArea rows={2} maxLength={500} placeholder={t("adminManage.classes.descriptionPlaceholder")} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={editTarget ? `${t("actions.edit")} "${editTarget.title}"` : t("adminManage.classes.editCourse")}
        open={!!editTarget}
        onCancel={() => { setEditTarget(null); editForm.resetFields(); }}
        onOk={() => editForm.submit()}
        confirmLoading={updateMutation.isPending}
        okText={t("actions.save")}
        width={680}
        destroyOnClose
      >
        <p style={{ color: "#888", marginTop: 0, fontSize: 12 }}>
          {t("adminManage.classes.editNote")}
        </p>
        <Form form={editForm} layout="vertical" onFinish={handleEdit}>
          <Row gutter={16}>
            <Col span={14}>
              <Form.Item name="title" label={t("adminManage.classes.fieldTitle")} rules={[{ required: true, message: t("adminManage.classes.titleRequired") }]}>
                <Input />
              </Form.Item>
            </Col>
            <Col span={10}>
              <Form.Item label={t("adminManage.classes.subject")}>
                <Input value={editTarget?.subject || ""} disabled />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={14}>
              <Form.Item label={t("roles.teacher")}>
                <Input value={editTarget?.teacherName || t("adminManage.classes.unassigned")} disabled />
              </Form.Item>
            </Col>
            <Col span={10}>
              <Form.Item name="defaultRoomId" label={t("adminManage.classes.roomOptional")}>
                <Select
                  allowClear
                  placeholder={t("adminManage.classes.selectRoom")}
                  options={rooms.map((r: any) => ({
                    label: `${r.name}${r.capacity ? ` · ${t("adminManage.classes.capLabel")} ${r.capacity}` : ""}`,
                    value: r.id || r._id,
                  }))}
                />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item
            name="daysOfWeek"
            label={t("adminManage.classes.daysOfWeek")}
            rules={[{ required: true, message: t("adminManage.classes.pickAtLeastOneDay") }]}
          >
            <Select mode="multiple" options={dayOptions} placeholder={t("adminManage.classes.pickDays")} />
          </Form.Item>
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="startTime" label={t("adminManage.classes.startTime")} rules={[{ required: true, message: t("adminManage.classes.required") }]}>
                <TimePicker style={{ width: "100%" }} format="HH:mm" minuteStep={5} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="endTime" label={t("adminManage.classes.endTime")} rules={[{ required: true, message: t("adminManage.classes.required") }]}>
                <TimePicker style={{ width: "100%" }} format="HH:mm" minuteStep={5} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="gradeTag" label={t("adminManage.classes.gradeTagOptional")}>
                <Input />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item
            name="dateRange"
            label={t("adminManage.classes.term")}
            rules={[{ required: true, message: t("adminManage.classes.termDatesRequired") }]}
          >
            <DatePicker.RangePicker style={{ width: "100%" }} format="YYYY-MM-DD" />
          </Form.Item>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="price"
                label={t("adminManage.classes.priceEGP")}
                rules={[{ required: true, message: t("adminManage.classes.priceRequired") }, { type: "number", min: 0, message: t("adminManage.classes.mustBeZeroOrMore") }]}
              >
                <InputNumber style={{ width: "100%" }} min={0} step={50} precision={2} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="maxStudents"
                label={t("adminManage.classes.maxStudents")}
                rules={[{ required: true, message: t("adminManage.classes.required") }, { type: "number", min: 1, message: t("adminManage.classes.mustBeOneOrMore") }]}
              >
                <InputNumber style={{ width: "100%" }} min={1} step={1} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="description" label={t("adminManage.classes.descriptionOptional")}>
            <Input.TextArea rows={2} maxLength={500} />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
    </Space>
  );
}
