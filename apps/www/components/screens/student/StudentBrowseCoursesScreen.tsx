"use client";

import React, { useState } from "react";
import { useList, useCustomMutation } from "@refinedev/core";
import { Card, Input, Button, Tag, Space, message, Row, Col, Typography, Select, Slider } from "antd";
import { SearchOutlined, BookOutlined, FilterOutlined } from "@ant-design/icons";
import Link from "next/link";
import { useI18n } from "@/components/providers/I18nProvider";

export function StudentBrowseCoursesScreen() {
  const { t, formatEGP } = useI18n();
  const [search, setSearch] = useState("");
  const [subject, setSubject] = useState<string | null>(null);
  const [priceRange, setPriceRange] = useState<[number, number]>([0, 10000]);
  const [showFilters, setShowFilters] = useState(false);

  const { query, result } = useList({
    resource: "search/courses",
    filters: [
      ...(search ? [{ field: "q", operator: "eq" as const, value: search }] : []),
      ...(subject ? [{ field: "subject", operator: "eq" as const, value: subject }] : []),
    ],
    pagination: { mode: "off" },
  });

  const { mutateAsync: requestEnrollment } = useCustomMutation();
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const allCourses = (result?.data ?? []) as any[];

  // Client-side price filter (backend doesn't support range filter yet)
  const courses = allCourses.filter((c) => {
    const priceEGP = (c.price ?? 0) / 100;
    return priceEGP >= priceRange[0] && priceEGP <= priceRange[1];
  });

  // Extract unique subjects for filter options
  const subjects = [...new Set(allCourses.map((c) => c.subject).filter(Boolean))].sort();

  const handleRequest = async (courseId: string) => {
    setLoadingId(courseId);
    try {
      await requestEnrollment({
        url: "enrollment-requests",
        method: "post",
        values: { courseId },
      });
      message.success(t("studentBrowse.enrollmentSent"));
    } catch (err: any) {
      message.error(err?.message || t("studentBrowse.enrollmentFailed"));
    } finally {
      setLoadingId(null);
    }
  };

  return (
    <Space direction="vertical" size="large" style={{ width: "100%" }}>
      <Card>
        <Space direction="vertical" size="middle" style={{ width: "100%" }}>
          <Input
            prefix={<SearchOutlined style={{ color: "#888" }} />}
            placeholder={t("studentBrowse.searchPlaceholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            size="large"
            allowClear
          />
          <div>
            <Button
              type="text"
              icon={<FilterOutlined />}
              onClick={() => setShowFilters(!showFilters)}
              size="small"
            >
              {showFilters ? t("studentBrowse.hideFilters") : t("studentBrowse.moreFilters")}
            </Button>
          </div>
          {showFilters && (
            <Row gutter={[16, 16]}>
              <Col xs={24} sm={12}>
                <div style={{ marginBottom: 4, fontSize: 13, color: "#888" }}>{t("studentBrowse.subject")}</div>
                <Select
                  allowClear
                  placeholder={t("studentBrowse.allSubjects")}
                  value={subject}
                  onChange={setSubject}
                  style={{ width: "100%" }}
                  options={subjects.map((s) => ({ value: s, label: s }))}
                />
              </Col>
              <Col xs={24} sm={12}>
                <div style={{ marginBottom: 4, fontSize: 13, color: "#888" }}>
                  {t("studentBrowse.priceRange")}: {priceRange[0]} – {priceRange[1] >= 10000 ? "10,000+" : priceRange[1]}
                </div>
                <Slider
                  range
                  min={0}
                  max={10000}
                  step={100}
                  value={priceRange}
                  onChange={(v) => setPriceRange(v as [number, number])}
                />
              </Col>
            </Row>
          )}
        </Space>
      </Card>

      {query.isLoading && <div style={{ textAlign: "center", padding: 40, color: "#888" }}>{t("studentBrowse.loadingCourses")}</div>}

      {!query.isLoading && courses.length === 0 && (
        <div style={{ textAlign: "center", padding: 40, color: "#888" }}>{t("studentBrowse.noCourses")}</div>
      )}

      <Row gutter={[16, 16]}>
        {courses.map((c) => (
          <Col xs={24} sm={12} lg={8} key={c._id || c.id}>
            <Card
              title={
                <Link href={`/courses/${c._id || c.id}`} style={{ color: "inherit" }}>
                  <Space><BookOutlined style={{ color: "#0fa5e9" }} />{c.title}</Space>
                </Link>
              }
              actions={[
                <Button
                  type="primary"
                  key="enroll"
                  loading={loadingId === (c._id || c.id)}
                  onClick={() => handleRequest(c._id || c.id)}
                >
                  {t("studentBrowse.requestEnrollment")}
                </Button>,
              ]}
              style={{ height: "100%", display: "flex", flexDirection: "column" }}
              styles={{ body: { flex: 1 } }}
            >
              <Typography.Paragraph ellipsis={{ rows: 2 }} style={{ color: "#555", minHeight: 44 }}>
                {c.description || t("studentBrowse.noDescription")}
              </Typography.Paragraph>
              <Space direction="vertical" size="small" style={{ width: "100%" }}>
                <Tag color="blue">{c.subject}</Tag>
                {c.teacherName && <div><strong>{t("roles.teacher")}:</strong> {c.teacherName}</div>}
                {c.schedulePattern?.daysOfWeek && (
                  <div style={{ fontSize: 12, color: "#888" }}>
                    {[
                      t("studentBrowse.sun"),
                      t("studentBrowse.mon"),
                      t("studentBrowse.tue"),
                      t("studentBrowse.wed"),
                      t("studentBrowse.thu"),
                      t("studentBrowse.fri"),
                      t("studentBrowse.sat"),
                    ]
                      .filter((_, i) => c.schedulePattern.daysOfWeek?.includes(i))
                      .join(", ")}{" "}
                    {c.schedulePattern.startTime}–{c.schedulePattern.endTime}
                  </div>
                )}
                <div><strong>{t("studentBrowse.price")}:</strong> {formatEGP(c.price ?? 0)}</div>
                {c.maxStudents && (
                  <div style={{ fontSize: 12, color: "#888" }}>
                    {c.enrolledCount ?? 0}/{c.maxStudents} {t("studentBrowse.seatsFilled")}
                  </div>
                )}
              </Space>
            </Card>
          </Col>
        ))}
      </Row>
    </Space>
  );
}
