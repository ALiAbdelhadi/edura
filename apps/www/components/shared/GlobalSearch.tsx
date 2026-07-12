"use client";

import { useState, useCallback, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import { AutoComplete, Input } from "antd";
import { SearchOutlined } from "@ant-design/icons";
import { useI18n } from "@/components/providers/I18nProvider";

type SearchResult = {
  value: string;
  label: React.ReactNode;
  key: string;
};

type Props = {
  role: string;
};

export default function GlobalSearch({ role }: Props) {
  const { t } = useI18n();
  const router = useRouter();
  const [options, setOptions] = useState<SearchResult[]>([]);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const basePath = useMemo(() => {
    if (role === "center_admin") return "/dashboard/admin";
    if (role === "teacher") return "/dashboard/teacher";
    if (role === "student") return "/dashboard/student";
    if (role === "parent") return "/dashboard/parent";
    return "/dashboard";
  }, [role]);

  const handleSearch = useCallback(
    (value: string) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (!value || value.length < 2) {
        setOptions([]);
        return;
      }

      timerRef.current = setTimeout(async () => {
        const results: SearchResult[] = [];

        try {
          const [coursesRes, ...rest] = await Promise.all([
            fetch("/api/v1/courses").then((r) => r.ok ? r.json() : { data: [] }),
            ...(role === "center_admin"
              ? [fetch(`/api/v1/roster/students?q=${encodeURIComponent(value)}`).then((r) => r.ok ? r.json() : { data: { items: [] } })]
              : []),
          ]);

          const q = value.toLowerCase();
          const courses = (coursesRes?.data ?? [])
            .filter((c: any) =>
              (c.title || "").toLowerCase().includes(q) ||
              (c.subject || "").toLowerCase().includes(q)
            )
            .slice(0, 5);
          if (courses.length > 0) {
            results.push({
              key: "courses-header",
              value: "",
              label: <span style={{ fontWeight: 600, color: "#888", fontSize: 12 }}>{t("shared.searchCourses")}</span>,
            });
            for (const c of courses) {
              results.push({
                key: `course-${c._id}`,
                value: c.title || c.subject,
                label: (
                  <span>
                    {c.title || c.subject}
                    {c.gradeTag ? <span style={{ color: "#888", marginLeft: 8 }}>{c.gradeTag}</span> : null}
                  </span>
                ),
              });
            }
          }

          if (role === "center_admin" && rest[0]) {
            const students = (rest[0]?.data?.items ?? []).slice(0, 5);
            if (students.length > 0) {
              results.push({
                key: "students-header",
                value: "",
                label: <span style={{ fontWeight: 600, color: "#888", fontSize: 12 }}>{t("shared.searchStudents")}</span>,
              });
              for (const s of students) {
                results.push({
                  key: `student-${s.id || s._id}`,
                  value: s.name || s.email,
                  label: (
                    <span>
                      {s.name || t("shared.searchUnnamed")} <span style={{ color: "#888" }}>{s.email}</span>
                    </span>
                  ),
                });
              }
            }
          }
        } catch {
          // silent fail
        }

        setOptions(results);
      }, 300);
    },
    [role, t],
  );

  const handleSelect = useCallback(
    (_value: string, option: SearchResult) => {
      const key = option.key;
      if (key.startsWith("course-")) {
        router.push(`${basePath}/classes`);
      } else if (key.startsWith("student-")) {
        const studentId = key.slice("student-".length);
        router.push(`${basePath}/students/${encodeURIComponent(studentId)}`);
      }
    },
    [router, basePath],
  );

  return (
    <AutoComplete
      options={options}
      onSearch={handleSearch}
      onSelect={(val, opt) => handleSelect(val, opt as SearchResult)}
      style={{ width: 280 }}
    >
      <Input prefix={<SearchOutlined />} placeholder={t("shared.searchPlaceholder")} size="small" allowClear />
    </AutoComplete>
  );
}
