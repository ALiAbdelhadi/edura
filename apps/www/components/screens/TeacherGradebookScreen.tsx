"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useList, useCustomMutation, useCreate } from "@refinedev/core";
import { Table, Card, Button, Input, Tag, Space, Select, Modal, Form, InputNumber, DatePicker, message as antMessage } from "antd";
import { SaveOutlined, PlusOutlined } from "@ant-design/icons";
import { BarChart } from "@/components/charts";
import { useI18n } from "@/components/providers/I18nProvider";

interface RawGrade {
  _id: string;
  courseId: string;
  name: string;
  gradeType?: "numeric" | "letter";
  maxScore: number;
  date: string;
  scores: Array<{ studentId: string; score: number }>;
}

const LETTER_OPTIONS = [
  { label: "A", value: 4 },
  { label: "B", value: 3 },
  { label: "C", value: 2 },
  { label: "D", value: 1 },
  { label: "F", value: 0 },
];

function numericToLetter(n: number): string {
  return { 4: "A", 3: "B", 2: "C", 1: "D", 0: "F" }[n] ?? String(n);
}

interface RawStudent {
  _id: string;
  name: string;
}

interface GradeEntry {
  _id: string;
  title: string;
  type: string;
  gradeType: "numeric" | "letter";
  maxScore: number;
  date: string;
}

interface StudentGradeRow {
  studentId: string;
  studentName: string;
  scores: Record<string, number>;
}

export function TeacherGradebookScreen() {
  const { t, formatDate } = useI18n();
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [selectedDistributionEntryId, setSelectedDistributionEntryId] = useState<string | null>(null);
  const [editedGrades, setEditedGrades] = useState<Record<string, Record<string, number>>>({});
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createForm] = Form.useForm();

  // Fetch courses
  const { query: coursesQuery, result: coursesResult } = useList({
    resource: "courses",
    pagination: { mode: "off" },
  });
  const courses = (coursesResult?.data ?? []) as any[];

  // Fetch grades for selected course
  const { query: gradesQuery, result: gradesResult } = useList({
    resource: "grades",
    filters: selectedCourseId
      ? [{ field: "courseId", operator: "eq" as const, value: selectedCourseId }]
      : [],
    pagination: { mode: "off" },
    queryOptions: { enabled: !!selectedCourseId },
  });
  const rawGrades = (gradesResult?.data ?? []) as unknown as RawGrade[];

  // Fetch students for name lookup
  const { result: enrollmentsResult } = useList({
    resource: "enrollments",
    filters: selectedCourseId
      ? [{ field: "courseId", operator: "eq" as const, value: selectedCourseId }]
      : [],
    pagination: { mode: "off" },
    queryOptions: { enabled: !!selectedCourseId },
  });
  const studentNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const e of (enrollmentsResult?.data ?? []) as any[]) {
      map.set(e.studentId.toString(), e.studentName);
    }
    return map;
  }, [enrollmentsResult]);

  // Save mutation
  const { mutateAsync: saveScores, mutation: saveMutation } = useCustomMutation<any>();
  const { mutate: createGrade, mutation: createMutation } = useCreate();

  const handleCreate = (values: any) => {
    if (!selectedCourseId) return;
    createGrade(
      {
        resource: "grades",
        values: {
          courseId: selectedCourseId,
          name: values.name.trim(),
          gradeType: values.gradeType || "numeric",
          maxScore: values.gradeType === "letter" ? 4 : values.maxScore,
          date: values.date.format("YYYY-MM-DD"),
        },
      },
      {
        onSuccess: () => {
          antMessage.success(`${t("teacher.assignmentCreated")}: "${values.name}"`);
          setIsCreateOpen(false);
          createForm.resetFields();
          gradesQuery.refetch();
        },
        onError: (err: any) => {
          antMessage.error(err?.message || t("teacher.createFailed"));
        },
      }
    );
  };

  // Auto-select first course
  useEffect(() => {
    if (courses.length > 0 && !selectedCourseId) {
      setSelectedCourseId(courses[0]._id);
    }
  }, [courses, selectedCourseId]);

  // Transform raw grades into entries + student rows
  const entries: GradeEntry[] = useMemo(
    () =>
      rawGrades.map((g) => ({
        _id: g._id,
        title: g.name,
        type: "exam",
        gradeType: g.gradeType || "numeric",
        maxScore: g.maxScore,
        date: g.date,
      })),
    [rawGrades],
  );

  useEffect(() => {
    if (entries.length === 0) {
      setSelectedDistributionEntryId(null);
      return;
    }
    if (
      !selectedDistributionEntryId ||
      !entries.some((entry) => entry._id === selectedDistributionEntryId)
    ) {
      setSelectedDistributionEntryId(entries[0]._id);
    }
  }, [entries, selectedDistributionEntryId]);

  const studentGrades: StudentGradeRow[] = useMemo(() => {
    const studentMap = new Map<string, StudentGradeRow>();
    for (const g of rawGrades) {
      for (const s of g.scores ?? []) {
        const sid = s.studentId.toString();
        if (!studentMap.has(sid)) {
          studentMap.set(sid, {
            studentId: sid,
            studentName: studentNameMap.get(sid) ?? sid,
            scores: {},
          });
        }
        studentMap.get(sid)!.scores[g._id] = s.score;
      }
    }
    return Array.from(studentMap.values());
  }, [rawGrades, studentNameMap]);

  const distributionData = useMemo(() => {
    const selectedEntry = entries.find((entry) => entry._id === selectedDistributionEntryId);
    if (!selectedEntry) return [];
    const buckets: Record<string, number> = {
      "0-49": 0,
      "50-59": 0,
      "60-69": 0,
      "70-79": 0,
      "80-89": 0,
      "90-100": 0,
    };
    for (const row of studentGrades) {
      const score = editedGrades[row.studentId]?.[selectedEntry._id] ?? row.scores?.[selectedEntry._id];
      if (score === undefined) continue;
      const pct = Math.round((score / (selectedEntry.maxScore || 1)) * 100);
      if (pct < 50) buckets["0-49"] += 1;
      else if (pct < 60) buckets["50-59"] += 1;
      else if (pct < 70) buckets["60-69"] += 1;
      else if (pct < 80) buckets["70-79"] += 1;
      else if (pct < 90) buckets["80-89"] += 1;
      else buckets["90-100"] += 1;
    }
    return Object.entries(buckets).map(([label, count]) => ({ label, count }));
  }, [entries, selectedDistributionEntryId, studentGrades, editedGrades]);

  const completionByAssignment = useMemo(
    () =>
      entries.map((entry) => {
        const total = studentGrades.length;
        const graded = studentGrades.filter((row) => {
          const score = editedGrades[row.studentId]?.[entry._id] ?? row.scores?.[entry._id];
          return score !== undefined;
        }).length;
        return {
          label: entry.title,
          completion: total > 0 ? Math.round((graded / total) * 100) : 0,
        };
      }),
    [entries, studentGrades, editedGrades],
  );

  const handleGradeChange = (studentId: string, entryId: string, value: string) => {
    const numValue = parseFloat(value);
    if (!isNaN(numValue)) {
      setEditedGrades((prev) => ({
        ...prev,
        [studentId]: { ...(prev[studentId] || {}), [entryId]: numValue },
      }));
    }
  };

  const handleSave = async () => {
    if (!selectedCourseId) return;

    // Fan out PUT /grades/:id/scores for each grade entry that has edits
    const promises = entries.map(async (entry) => {
      // Collect all scores for this entry (original + edited)
      const scores: Array<{ studentId: string; score: number }> = [];
      for (const sg of studentGrades) {
        const editedScore = editedGrades[sg.studentId]?.[entry._id];
        const originalScore = sg.scores[entry._id];
        if (editedScore !== undefined) {
          scores.push({ studentId: sg.studentId, score: editedScore });
        } else if (originalScore !== undefined) {
          scores.push({ studentId: sg.studentId, score: originalScore });
        }
      }
      if (scores.length === 0) return;

      await saveScores({
        url: `grades/${entry._id}/scores`,
        method: "put",
        values: scores,
      });
    });

    await Promise.all(promises);
    setEditedGrades({});
    gradesQuery.refetch();
  };

  const isLoading = coursesQuery.isLoading || gradesQuery.isLoading;

  if (isLoading && courses.length === 0) {
    return <div style={{ textAlign: "center", padding: 40, color: "#888" }}>{t("teacher.loadingClasses")}</div>;
  }

  if (courses.length === 0) {
    return <div style={{ textAlign: "center", padding: 40, color: "#888" }}>{t("teacher.noClassesAssigned")}</div>;
  }

  const entryColumns = entries.map((e) => ({
    title: (
      <div style={{ textAlign: "center" }}>
        <div>{e.title}</div>
        <div style={{ fontSize: 11, color: "#888", fontWeight: 400 }}>
          {e.type} · /{e.maxScore} · {formatDate(e.date)}
        </div>
      </div>
    ),
    key: e._id,
    align: "center" as const,
    render: (_: any, record: StudentGradeRow) => {
      const originalScore = record.scores?.[e._id] || 0;
      const editedScore = editedGrades[record.studentId]?.[e._id];
      const activeScore = editedScore !== undefined ? editedScore : originalScore;
      const isEdited = editedScore !== undefined;

      if (e.gradeType === "letter") {
        return (
          <div>
            <Select
              value={activeScore}
              onChange={(val) => handleGradeChange(record.studentId, e._id, String(val))}
              options={LETTER_OPTIONS}
              style={{
                width: 60,
                borderColor: isEdited ? "#0fa5e9" : undefined,
              }}
              size="small"
            />
            <div style={{ fontSize: 11, color: "#888" }}>{numericToLetter(activeScore)}</div>
          </div>
        );
      }

      return (
        <div>
          <Input
            value={activeScore}
            onChange={(ev) => handleGradeChange(record.studentId, e._id, ev.target.value)}
            style={{
              width: 60,
              textAlign: "center",
              borderColor: isEdited ? "#0fa5e9" : undefined,
              background: isEdited ? "#f0f9ff" : undefined,
            }}
            size="small"
          />
          <div style={{ fontSize: 11, color: "#888" }}>{Math.round((activeScore / e.maxScore) * 100)}%</div>
        </div>
      );
    },
  }));

  const columns = [
    {
      title: t("teacher.student"),
      key: "student",
      fixed: "left" as const,
      width: 160,
      render: (_: any, record: StudentGradeRow) => (
        <span style={{ fontWeight: 600 }}>{record.studentName}</span>
      ),
    },
    ...entryColumns,
    {
      title: t("teacher.avg"),
      key: "avg",
      align: "center" as const,
      fixed: "right" as const,
      width: 80,
      render: (_: any, record: StudentGradeRow) => {
        let totalScore = 0;
        let totalMax = 0;
        entries.forEach((entry) => {
          const originalScore = record.scores?.[entry._id] || 0;
          const editedScore = editedGrades[record.studentId]?.[entry._id];
          const activeScore = editedScore !== undefined ? editedScore : originalScore;
          totalScore += activeScore;
          totalMax += entry.maxScore;
        });
        const avg = totalMax > 0 ? Math.round((totalScore / totalMax) * 100) : 0;
        const color = avg >= 90 ? "green" : avg >= 75 ? "blue" : "orange";
        return <Tag color={color}>{avg}%</Tag>;
      },
    },
  ];

  return (
    <Space direction="vertical" size="middle" style={{ width: "100%" }}>
      <Card size="small">
        <Space>
          <span style={{ fontWeight: 600 }}>{t("teacher.course")}</span>
          <Select
            value={selectedCourseId}
            onChange={(val) => {
              setSelectedCourseId(val);
              setEditedGrades({});
            }}
            style={{ width: 240 }}
            options={courses.map((c: any) => ({ value: c._id, label: `${c.subject} - ${c.gradeTag}` }))}
          />
        </Space>
      </Card>

      <Card
        title={t("nav.gradebook")}
        extra={
          <Space>
            <Button size="small" icon={<PlusOutlined />} onClick={() => setIsCreateOpen(true)} disabled={!selectedCourseId}>
              {t("teacher.createAssignment")}
            </Button>
            {Object.keys(editedGrades).length > 0 && (
              <Button size="small" onClick={() => setEditedGrades({})}>
                {t("teacher.discard")}
              </Button>
            )}
            <Button
              type="primary"
              size="small"
              icon={<SaveOutlined />}
              onClick={handleSave}
              loading={saveMutation.isPending}
              disabled={Object.keys(editedGrades).length === 0}
            >
              {t("teacher.saveGrades")}
            </Button>
          </Space>
        }
      >
        <Space direction="vertical" size="middle" style={{ width: "100%" }}>
          <Card
            size="small"
            title={t("teacher.scoreDistribution")}
            extra={
              <Select
                size="small"
                value={selectedDistributionEntryId}
                onChange={setSelectedDistributionEntryId}
                style={{ minWidth: 220 }}
                options={entries.map((entry) => ({
                  value: entry._id,
                  label: entry.title,
                }))}
              />
            }
          >
            <BarChart
              data={distributionData}
              series={[{ key: "count", label: t("teacher.scores"), color: "#8b5cf6" }]}
              emptyText={t("teacher.noDistribution")}
            />
          </Card>
          <Card size="small" title={t("teacher.completionByAssignment")}>
            <BarChart
              data={completionByAssignment}
              series={[{ key: "completion", label: t("teacher.completionPct"), color: "#22c55f" }]}
              horizontal
              yValueFormatter={(value) => `${Math.round(value)}%`}
              emptyText={t("teacher.noCompletion")}
            />
          </Card>
        </Space>

        {entries.length === 0 ? (
          <div style={{ textAlign: "center", padding: 40, color: "#888" }}>
            {t("teacher.noGradeEntries")}
          </div>
        ) : studentGrades.length === 0 ? (
          <div style={{ textAlign: "center", padding: 40, color: "#888" }}>
            {t("teacher.noStudentsEnrolled")}
          </div>
        ) : (
          <Table
            dataSource={studentGrades}
            columns={columns}
            rowKey={(r) => r.studentId}
            loading={isLoading}
            pagination={false}
            scroll={{ x: Math.max(500, entries.length * 120 + 240) }}
            size="small"
          />
        )}
      </Card>

      <Modal
        title={t("teacher.createModalTitle")}
        open={isCreateOpen}
        onCancel={() => { setIsCreateOpen(false); createForm.resetFields(); }}
        onOk={() => createForm.submit()}
        confirmLoading={createMutation.isPending}
        okText={t("teacher.create")}
        destroyOnClose
      >
        <Form
          form={createForm}
          layout="vertical"
          onFinish={handleCreate}
          initialValues={{ maxScore: 100 }}
        >
          <Form.Item name="name" label={t("teacher.assignmentName")} rules={[{ required: true, message: t("teacher.nameRequired") }]}>
            <Input placeholder={t("teacher.assignmentNamePlaceholder")} />
          </Form.Item>
          <Form.Item name="gradeType" label={t("teacher.gradeType")} initialValue="numeric">
            <Select
              options={[
                { label: t("teacher.gradeTypeNumeric"), value: "numeric" },
                { label: t("teacher.gradeTypeLetter"), value: "letter" },
              ]}
            />
          </Form.Item>
          <Form.Item noStyle shouldUpdate={(prev, cur) => prev.gradeType !== cur.gradeType}>
            {({ getFieldValue }) =>
              getFieldValue("gradeType") !== "letter" ? (
                <Form.Item name="maxScore" label={t("teacher.maxScore")} rules={[{ required: true, message: t("teacher.maxScoreRequired") }, { type: "number", min: 1 }]}>
                  <InputNumber style={{ width: "100%" }} min={1} />
                </Form.Item>
              ) : null
            }
          </Form.Item>
          <Form.Item name="date" label={t("teacher.date")} rules={[{ required: true, message: t("teacher.dateRequired") }]}>
            <DatePicker style={{ width: "100%" }} format="YYYY-MM-DD" />
          </Form.Item>
        </Form>
      </Modal>
    </Space>
  );
}
