/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { Combobox } from "@/components/kit/combobox";
import { DataTable, type ColumnDef } from "@/components/kit/data-table";
import { EmptyState } from "@/components/kit/empty-state";
import { PageSpinner, Spinner } from "@/components/kit/spinner";
import { LoadError } from "@repo/ui/components/ledger";
import { useQueryStrings } from "@repo/ui/components/query-section";
import { Link } from "@/i18n/navigation";
import { useParamSeed } from "@/lib/api/use-param-seed";
import { useFormatters } from "@/lib/i18n/use-formatters";
import { track } from "@/lib/track";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  useCreate,
  useCustomMutation,
  useInvalidate,
  useList,
  useUpdate,
} from "@refinedev/core";
import { ANALYTICS_EVENTS } from "@repo/observability";
import { Alert, AlertTitle } from "@repo/ui/components/alert";
import { Button } from "@repo/ui/components/button";
import { Card, CardContent } from "@repo/ui/components/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@repo/ui/components/form";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/select";
import { toast } from "@repo/ui/components/sonner";
import { Textarea } from "@repo/ui/components/textarea";
import { ToggleGroup, ToggleGroupItem } from "@repo/ui/components/toggle-group";
import {
  BookOpen,
  Eye,
  Filter,
  Info,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Amount, Badge, Num, PageHead } from "./ledger";

export function AdminClassesScreen() {
  const t = useTranslations();
  const queryStrings = useQueryStrings();
  const { formatEGP, formatClockRange, locale } = useFormatters();
  const { query, result } = useList({ resource: "courses" });
  const { result: teachersResult } = useList({
    resource: "teachers",
    pagination: { mode: "off" },
  });
  const { result: roomsResult } = useList({
    resource: "rooms",
    pagination: { mode: "off" },
  });
  const { mutate: cancelCourse, mutation: cancelMutation } =
    useCustomMutation();
  const { mutate: createCourse, mutation: createMutation } = useCreate();
  const { mutate: updateCourse, mutation: updateMutation } = useUpdate();
  const invalidate = useInvalidate();
  const [search, setSearch] = useState("");
  useParamSeed("q", setSearch);
  const [subjectFilter, setSubjectFilter] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [teacherFilter, setTeacherFilter] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<{
    id: string;
    title: string;
  } | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<any | null>(null);

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

  const scheduleShape = {
    daysOfWeek: z
      .array(z.number())
      .min(1, t("adminManage.classes.pickAtLeastOneDay")),
    startTime: z.string().min(1, t("adminManage.classes.required")),
    endTime: z.string().min(1, t("adminManage.classes.required")),
    startDate: z.string().min(1, t("adminManage.classes.termDatesRequired")),
    endDate: z.string().min(1, t("adminManage.classes.termDatesRequired")),
    gradeTag: z.string().optional(),
    defaultRoomId: z.string().optional(),
    description: z.string().optional(),
    price: z
      .number({ message: t("adminManage.classes.priceRequired") })
      .min(0, t("adminManage.classes.mustBeZeroOrMore")),
    maxStudents: z
      .number({ message: t("adminManage.classes.required") })
      .min(1, t("adminManage.classes.mustBeOneOrMore")),

    pricePerMonth: z.number().min(0, t("adminManage.classes.mustBeZeroOrMore")).optional(),
    pricePerSession: z.number().min(0, t("adminManage.classes.mustBeZeroOrMore")).optional(),
    settlementBasis: z.enum(["course_price", "session_price", "subscription"]).optional(),
  };
  const createSchema = z.object({
    title: z.string().min(1, t("adminManage.classes.titleRequired")),
    subject: z.string().min(1, t("adminManage.classes.subjectRequired")),
    teacherId: z.string().min(1, t("adminManage.classes.teacherRequired")),
    ...scheduleShape,
  });
  const editSchema = z.object({
    title: z.string().min(1, t("adminManage.classes.titleRequired")),
    ...scheduleShape,
  });
  type CreateValues = z.infer<typeof createSchema>;
  type EditValues = z.infer<typeof editSchema>;

  const createForm = useForm<CreateValues>({
    resolver: zodResolver(createSchema),
    defaultValues: {
      title: "",
      subject: "",
      teacherId: "",
      defaultRoomId: undefined,
      gradeTag: "",
      description: "",
      daysOfWeek: [],
      startTime: "",
      endTime: "",
      startDate: "",
      endDate: "",
      price: 500,
      maxStudents: 20,
    },
  });

  const editForm = useForm<EditValues>({
    resolver: zodResolver(editSchema),
    defaultValues: {
      title: "",
      defaultRoomId: undefined,
      gradeTag: "",
      description: "",
      daysOfWeek: [],
      startTime: "",
      endTime: "",
      startDate: "",
      endDate: "",
      price: 0,
      maxStudents: 1,
    },
  });
  const surfaceInvalid = () => {
    toast.error(t("adminManage.classes.checkFields"));
    setTimeout(() => {
      (document.activeElement as HTMLElement | null)?.scrollIntoView?.({
        block: "center",
        behavior: "smooth",
      });
    }, 50);
  };

  const describeApiError = (err: unknown, fallback: string) => {
    const e = err as { message?: string; errors?: Record<string, string[]> };
    const fieldMsgs = e?.errors ? Object.values(e.errors).flat() : [];
    const head = e?.message || fallback;
    return fieldMsgs.length ? `${head}: ${fieldMsgs.join(" · ")}` : head;
  };

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
        startTime: values.startTime,
        endTime: values.endTime,
        startDate: values.startDate,
        endDate: values.endDate,
      },
      price: Math.round(values.price * 100),
      maxStudents: values.maxStudents,
    };
    createCourse(
      { resource: "courses", values: payload },
      {
        onSuccess: () => {
          toast.success(
            `${t("adminManage.classes.courseCreated")}: "${payload.title}"`,
          );
          setIsCreateOpen(false);
          createForm.reset();
          invalidate({ resource: "courses", invalidates: ["list"] });
        },
        onError: (err) => {
          toast.error(describeApiError(err, t("adminManage.classes.failedCreate")));
        },
      },
    );
  };

  const courses = (result?.data ?? []) as any[];

  const subjects = [
    ...new Set(courses.map((c: any) => c.subject).filter(Boolean)),
  ].sort();
  const teacherNames = [
    ...new Set(courses.map((c: any) => c.teacherName).filter(Boolean)),
  ].sort();

  const filtered = courses.filter((c: any) => {
    const matchesSearch =
      !search ||
      (c.title || "").toLowerCase().includes(search.toLowerCase()) ||
      (c.teacherName || "").toLowerCase().includes(search.toLowerCase());
    const matchesSubject = !subjectFilter || c.subject === subjectFilter;
    const matchesStatus =
      !statusFilter || (c.status || "active") === statusFilter;
    const matchesTeacher = !teacherFilter || c.teacherName === teacherFilter;
    return matchesSearch && matchesSubject && matchesStatus && matchesTeacher;
  });

  const openEdit = (course: any) => {
    setEditTarget(course);
    editForm.reset({
      title: course.title || "",
      gradeTag: course.gradeTag || "",
      description: course.description || "",
      defaultRoomId: course.defaultRoomId || undefined,
      daysOfWeek: course.schedulePattern?.daysOfWeek ?? [],
      startTime: course.schedulePattern?.startTime || "",
      endTime: course.schedulePattern?.endTime || "",
      startDate: String(course.schedulePattern?.startDate || "").slice(0, 10),
      endDate: String(course.schedulePattern?.endDate || "").slice(0, 10),
      price: (course.price ?? 0) / 100,
      maxStudents: course.maxStudents ?? 1,
      pricePerMonth: course.pricePerMonth ? course.pricePerMonth / 100 : undefined,
      pricePerSession: course.pricePerSession ? course.pricePerSession / 100 : undefined,
      settlementBasis: course.settlementBasis ?? "course_price",
    });
  };

  const handleEdit = (values: EditValues) => {
    if (!editTarget) return;
    const id = editTarget.id;
    const payload = {
      title: values.title.trim(),
      gradeTag: values.gradeTag?.trim() || undefined,
      description: values.description?.trim() || undefined,
      defaultRoomId: values.defaultRoomId || undefined,
      schedulePattern: {
        daysOfWeek: values.daysOfWeek,
        startTime: values.startTime,
        endTime: values.endTime,
        startDate: values.startDate,
        endDate: values.endDate,
      },
      price: Math.round(values.price * 100),
      maxStudents: values.maxStudents,
      pricePerMonth:
        Number.isFinite(values.pricePerMonth) && (values.pricePerMonth as number) > 0
          ? Math.round((values.pricePerMonth as number) * 100)
          : null,
      settlementBasis: values.settlementBasis,
      pricePerSession:
        Number.isFinite(values.pricePerSession) && (values.pricePerSession as number) > 0
          ? Math.round((values.pricePerSession as number) * 100)
          : null,
    };
    updateCourse(
      { resource: "courses", id, values: payload },
      {
        onSuccess: () => {
          toast.success(
            `${t("adminManage.classes.courseUpdated")}: "${payload.title}"`,
          );
          setEditTarget(null);
          editForm.reset();
          invalidate({ resource: "courses", invalidates: ["list"] });
        },
        onError: (err) => {
          toast.error(describeApiError(err, t("adminManage.classes.failedUpdate")));
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
          toast.success(
            `${t("adminManage.classes.courseCancelled")}: "${cancelTarget.title}"`,
          );
          setCancelTarget(null);
          setCancelReason("");
          invalidate({ resource: "courses", invalidates: ["list"] });
        },
        onError: (err) => {
          toast.error(
            (err as { message?: string })?.message ||
            t("adminManage.classes.failedCancel"),
          );
        },
      },
    );
  };

  const mapDays = (days: number[] = []) => {
    return days
      .map((d) => dayLabels[d] || t("adminManage.classes.unknown"))
      .join(", ");
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

  const columns: ColumnDef<any>[] = [
    {
      id: "course",
      header: t("adminManage.classes.colCourse"),
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <BookOpen className="size-4 text-info" />
          <span className="font-semibold">{row.original.title}</span>
        </div>
      ),
    },
    {
      id: "teacherName",
      accessorKey: "teacherName",
      header: t("roles.teacher"),
      cell: ({ row }) =>
        row.original.teacherName || t("adminManage.classes.unassigned"),
    },
    {
      id: "schedule",
      header: t("adminManage.classes.colSchedule"),
      cell: ({ row }) => {
        const days = row.original.schedulePattern?.daysOfWeek;
        const start = row.original.schedulePattern?.startTime;
        const end = row.original.schedulePattern?.endTime;
        return `${mapDays(days)} · ${
          start || end ? formatClockRange(start, end) : "?"
        }`;
      },
    },
    {
      id: "roomName",
      accessorKey: "roomName",
      header: t("adminManage.classes.colRoom"),
      cell: ({ row }) => row.original.roomName || t("adminManage.classes.tbd"),
    },
    {
      id: "price",
      header: t("adminManage.classes.colPrice"),
      cell: ({ row }) => {
        const c = row.original;
        const unpriced = !c.pricePerMonth && !c.pricePerSession;
        return (
          <div className="flex flex-col items-end gap-0.5">
            {c.pricePerMonth ? (
              <span className="flex items-baseline gap-1">
                <Amount
                  piasters={c.pricePerMonth}
                  locale={locale}
                  decimals={false}
                  className="text-[13px] text-(--ink)"
                />
                <span className="text-[11px] text-(--ink-3)">
                  /{t("adminManage.classes.perMonthShort")}
                </span>
              </span>
            ) : null}
            {c.pricePerSession ? (
              <span className="flex items-baseline gap-1">
                <Amount
                  piasters={c.pricePerSession}
                  locale={locale}
                  decimals={false}
                  className="text-[13px] text-(--ink)"
                />
                <span className="text-[11px] text-(--ink-3)">
                  /{t("adminManage.classes.perSessionShort")}
                </span>
              </span>
            ) : null}
            {unpriced ? <Badge tone="failed">{t("adminManage.classes.unpriced")}</Badge> : null}
          </div>
        );
      },
    },
    {
      id: "capacity",
      header: t("adminManage.classes.colCapacity"),
      cell: ({ row }) => {
        const enrolled = row.original.enrolledStudentsCount || 0;
        const max = row.original.maxStudents || 1;
        const pct = Math.min(100, (enrolled / max) * 100);
        const full = enrolled >= max;
        return (
          <div className="flex w-30 flex-col gap-1">
            <Num
              className={`text-xs ${full ? "text-(--amber)" : "text-(--ink-2)"}`}
            >
              {enrolled}/{max}
            </Num>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-(--rule)">
              <div
                className="h-full rounded-full bg-(--money)"
                style={{ width: `${Math.round(pct)}%` }}
              />
            </div>
          </div>
        );
      },
    },
    {
      id: "status",
      header: t("adminManage.classes.colStatus"),
      cell: ({ row }) => {
        const status = row.original.status || "active";
        return (
          <Badge tone={status === "active" ? "done" : "neutral"}>{statusLabel(status)}</Badge>
        );
      },
    },
    {
      id: "actions",
      header: t("adminManage.classes.colActions"),
      cell: ({ row }) => {
        const record = row.original;
        return (
          <div className="flex items-center gap-1">
            <Button asChild variant="ghost" size="sm">
              <Link href={`/courses/${record.id}`}>
                <Eye className="size-4" />
                {t("adminManage.classes.view")}
              </Link>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={record.status === "cancelled"}
              onClick={() => openEdit(record)}
            >
              <Pencil className="size-4" />
              {t("actions.edit")}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              disabled={record.status === "cancelled"}
              onClick={() => {
                setCancelTarget({
                  id: record.id,
                  title: record.title,
                });
                setCancelReason("");
              }}
            >
              <Trash2 className="size-4" />
              {t("actions.cancel")}
            </Button>
          </div>
        );
      },
    },
  ];

  const roomOptions = rooms.map((r: any) => ({
    label: `${r.name}${r.capacity ? ` · ${t("adminManage.classes.capLabel")} ${r.capacity}` : ""}`,
    value: (r.id) as string,
  }));

  return (
    <div className="flex flex-col gap-5">
      <PageHead
        title={t("adminManage.classes.title")}
        subtitle={t("adminManage.classes.subtitle")}
        actions={
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative w-full sm:w-56">
              <Search className="pointer-events-none absolute inset-s-0 top-1/2 ms-2.5 size-4 -translate-y-1/2 text-(--ink-3)" />
              <Input
                placeholder={t("adminManage.classes.searchPlaceholder")}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="border-(--rule) bg-(--field) ps-9 pe-9"
              />
              {search ? (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  aria-label={t("actions.search")}
                  className="absolute inset-e-0 top-1/2 me-2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="size-4" />
                </button>
              ) : null}
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => setShowFilters(!showFilters)}
              >
                <Filter className="size-4" />
                {t("adminManage.classes.filters")}
              </Button>
              <Button onClick={() => setIsCreateOpen(true)}>
                <Plus className="size-4" />
                {t("adminManage.classes.createCourse")}
              </Button>
            </div>
          </div>
        }
      />
      {courses.some((c: any) => c.status === "active" && !c.pricePerMonth && !c.pricePerSession) ? (
        <Alert className="bg-warning/12 text-warning">
          <Info />
          <AlertTitle>{t("adminManage.classes.unpricedBanner")}</AlertTitle>
        </Alert>
      ) : null}
      <Card>
        <CardContent className="space-y-4">
          {showFilters && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <p className="mb-1 text-xs text-muted-foreground">
                  {t("adminManage.classes.subject")}
                </p>
                <Select
                  value={subjectFilter ?? "all"}
                  onValueChange={(v) =>
                    setSubjectFilter(v === "all" ? null : v)
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue
                      placeholder={t("adminManage.classes.allSubjects")}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">
                      {t("adminManage.classes.allSubjects")}
                    </SelectItem>
                    {subjects.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <p className="mb-1 text-xs text-muted-foreground">
                  {t("adminManage.classes.status")}
                </p>
                <Select
                  value={statusFilter ?? "all"}
                  onValueChange={(v) => setStatusFilter(v === "all" ? null : v)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue
                      placeholder={t("adminManage.classes.allStatuses")}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">
                      {t("adminManage.classes.allStatuses")}
                    </SelectItem>
                    <SelectItem value="active">{t("status.active")}</SelectItem>
                    <SelectItem value="ended">
                      {t("adminManage.classes.ended")}
                    </SelectItem>
                    <SelectItem value="cancelled">
                      {t("status.cancelled")}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <p className="mb-1 text-xs text-muted-foreground">
                  {t("roles.teacher")}
                </p>
                <Combobox
                  options={teacherNames.map((name) => ({
                    value: name as string,
                    label: name as string,
                  }))}
                  value={teacherFilter}
                  onChange={setTeacherFilter}
                  placeholder={t("adminManage.classes.allTeachers")}
                  searchPlaceholder={t("actions.search")}
                  emptyText={t("common.noData")}
                  clearLabel={t("adminManage.classes.allTeachers")}
                />
              </div>
            </div>
          )}
          {query.isLoading ? (
            <PageSpinner />
          ) : query.isError ? (
            <LoadError
              message={queryStrings.loadFailed}
              onRetry={() => query.refetch()}
              retryLabel={queryStrings.retry}
            />
          ) : (
            <DataTable
              columns={columns}
              data={filtered}
              pageSize={10}
              emptyState={
                <EmptyState
                  icon={BookOpen}
                  title={t("activation.empty.classes.title")}
                  description={t("activation.empty.classes.body")}
                  action={
                    <Button
                      onClick={() => {
                        track(ANALYTICS_EVENTS.EMPTY_STATE_CTA_CLICKED, { list: "classes" });
                        setIsCreateOpen(true);
                      }}
                    >
                      {t("activation.empty.classes.cta")}
                    </Button>
                  }
                />
              }
            />
          )}
        </CardContent>
      </Card>
      { }
      <Dialog
        open={!!cancelTarget}
        onOpenChange={(o) => {
          if (!o) {
            setCancelTarget(null);
            setCancelReason("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {cancelTarget
                ? `${t("actions.cancel")} "${cancelTarget.title}"?`
                : t("adminManage.classes.cancelCourse")}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {t("adminManage.classes.cancelWarning")}
          </p>
          <Textarea
            placeholder={t("adminManage.classes.cancelReasonPlaceholder")}
            rows={3}
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
          />
          <DialogFooter>
            <Button
              variant="outline"
              type="button"
              onClick={() => {
                setCancelTarget(null);
                setCancelReason("");
              }}
            >
              {t("adminManage.classes.keepActive")}
            </Button>
            <Button
              variant="destructive"
              disabled={!cancelReason.trim() || cancelMutation.isPending}
              onClick={handleCancelSubmit}
            >
              {cancelMutation.isPending ? <Spinner /> : null}
              {t("adminManage.classes.cancelCourse")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      { }
      <Dialog
        open={isCreateOpen}
        onOpenChange={(o) => {
          setIsCreateOpen(o);
          if (!o) createForm.reset();
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {t("adminManage.classes.createCourseTitle")}
            </DialogTitle>
          </DialogHeader>
          {activeTeachers.length === 0 && (
            <p className="text-sm text-destructive">
              {t("adminManage.classes.noActiveTeachers")}
            </p>
          )}
          <Form {...createForm}>
            <form
              noValidate
              id="create-course-form"
              onSubmit={createForm.handleSubmit(handleCreate, surfaceInvalid)}
              className="space-y-4"
            >
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <FormField
                  control={createForm.control}
                  name="title"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        {t("adminManage.classes.fieldTitle")}
                      </FormLabel>
                      <FormControl>
                        <Input
                          placeholder={t(
                            "adminManage.classes.titlePlaceholder",
                          )}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={createForm.control}
                  name="subject"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("adminManage.classes.subject")}</FormLabel>
                      <FormControl>
                        <Input
                          placeholder={t(
                            "adminManage.classes.subjectPlaceholder",
                          )}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <FormField
                  control={createForm.control}
                  name="teacherId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("roles.teacher")}</FormLabel>
                      <FormControl>
                        <Combobox
                          options={activeTeachers.map((tch: any) => ({
                            value: tch.teacherId,
                            label:
                              tch.name ||
                              tch.email ||
                              t("adminManage.classes.unknown"),
                          }))}
                          value={field.value}
                          onChange={(v) => field.onChange(v ?? "")}
                          placeholder={t("adminManage.classes.selectTeacher")}
                          searchPlaceholder={t("actions.search")}
                          emptyText={t("common.noData")}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={createForm.control}
                  name="defaultRoomId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        {t("adminManage.classes.roomOptional")}
                      </FormLabel>
                      <div className="flex items-center gap-1">
                        <Select
                          value={field.value || undefined}
                          onValueChange={field.onChange}
                        >
                          <FormControl>
                            <SelectTrigger className="w-full">
                              <SelectValue
                                placeholder={t(
                                  "adminManage.classes.selectRoom",
                                )}
                              />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {roomOptions.map((r) => (
                              <SelectItem key={r.value} value={r.value}>
                                {r.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {field.value ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            aria-label="clear"
                            onClick={() => field.onChange(undefined)}
                          >
                            <X className="size-4" />
                          </Button>
                        ) : null}
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={createForm.control}
                name="daysOfWeek"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("adminManage.classes.daysOfWeek")}</FormLabel>
                    <FormControl>
                      <ToggleGroup
                        type="multiple"
                        variant="outline"
                        value={(field.value ?? []).map(String)}
                        onValueChange={(vals) =>
                          field.onChange(vals.map(Number))
                        }
                        className="flex-wrap justify-start"
                      >
                        {dayOptions.map((d) => (
                          <ToggleGroupItem
                            key={d.value}
                            value={String(d.value)}
                            aria-label={d.label}
                            className="data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
                          >
                            {d.label}
                          </ToggleGroupItem>
                        ))}
                      </ToggleGroup>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <FormField
                  control={createForm.control}
                  name="startTime"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        {t("adminManage.classes.startTime")}
                      </FormLabel>
                      <FormControl>
                        <Input type="time" step={300} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={createForm.control}
                  name="endTime"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("adminManage.classes.endTime")}</FormLabel>
                      <FormControl>
                        <Input type="time" step={300} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={createForm.control}
                  name="gradeTag"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        {t("adminManage.classes.gradeTagOptional")}
                      </FormLabel>
                      <FormControl>
                        <Input
                          placeholder={t(
                            "adminManage.classes.gradeTagPlaceholder",
                          )}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <div className="space-y-2">
                <Label>{t("adminManage.classes.term")}</Label>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <FormField
                    control={createForm.control}
                    name="startDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormControl>
                          <Input
                            type="date"
                            aria-label={t("adminManage.classes.term")}
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={createForm.control}
                    name="endDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormControl>
                          <Input
                            type="date"
                            aria-label={t("adminManage.classes.term")}
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <FormField
                  control={createForm.control}
                  name="price"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("adminManage.classes.priceEGP")}</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={0}
                          step="0.01"
                          inputMode="decimal"
                          value={
                            Number.isFinite(field.value) ? field.value : ""
                          }
                          onChange={(e) =>
                            field.onChange(
                              e.target.value === ""
                                ? NaN
                                : e.target.valueAsNumber,
                            )
                          }
                          onBlur={field.onBlur}
                          name={field.name}
                          ref={field.ref}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={createForm.control}
                  name="maxStudents"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        {t("adminManage.classes.maxStudents")}
                      </FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={1}
                          step={1}
                          value={
                            Number.isFinite(field.value) ? field.value : ""
                          }
                          onChange={(e) =>
                            field.onChange(
                              e.target.value === ""
                                ? NaN
                                : e.target.valueAsNumber,
                            )
                          }
                          onBlur={field.onBlur}
                          name={field.name}
                          ref={field.ref}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={createForm.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      {t("adminManage.classes.descriptionOptional")}
                    </FormLabel>
                    <FormControl>
                      <Textarea
                        rows={2}
                        maxLength={500}
                        placeholder={t(
                          "adminManage.classes.descriptionPlaceholder",
                        )}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </form>
          </Form>
          <DialogFooter>
            <Button
              variant="outline"
              type="button"
              onClick={() => {
                setIsCreateOpen(false);
                createForm.reset();
              }}
            >
              {t("actions.cancel")}
            </Button>
            <Button
              type="submit"
              form="create-course-form"
              disabled={createMutation.isPending}
            >
              {createMutation.isPending ? <Spinner /> : null}
              {t("adminManage.classes.create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      { }
      <Dialog
        open={!!editTarget}
        onOpenChange={(o) => {
          if (!o) {
            setEditTarget(null);
            editForm.reset();
          }
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editTarget
                ? `${t("actions.edit")} "${editTarget.title}"`
                : t("adminManage.classes.editCourse")}
            </DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">
            {t("adminManage.classes.editNote")}
          </p>
          <Form {...editForm}>
            <form
              noValidate
              id="edit-course-form"
              onSubmit={editForm.handleSubmit(handleEdit, surfaceInvalid)}
              className="space-y-4"
            >
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <FormField
                  control={editForm.control}
                  name="title"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        {t("adminManage.classes.fieldTitle")}
                      </FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="space-y-2">
                  <Label>{t("adminManage.classes.subject")}</Label>
                  <Input value={editTarget?.subject || ""} disabled />
                </div>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>{t("roles.teacher")}</Label>
                  <Input
                    value={
                      editTarget?.teacherName ||
                      t("adminManage.classes.unassigned")
                    }
                    disabled
                  />
                </div>
                <FormField
                  control={editForm.control}
                  name="defaultRoomId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        {t("adminManage.classes.roomOptional")}
                      </FormLabel>
                      <div className="flex items-center gap-1">
                        <Select
                          value={field.value || undefined}
                          onValueChange={field.onChange}
                        >
                          <FormControl>
                            <SelectTrigger className="w-full">
                              <SelectValue
                                placeholder={t(
                                  "adminManage.classes.selectRoom",
                                )}
                              />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {roomOptions.map((r) => (
                              <SelectItem key={r.value} value={r.value}>
                                {r.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {field.value ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            aria-label="clear"
                            onClick={() => field.onChange(undefined)}
                          >
                            <X className="size-4" />
                          </Button>
                        ) : null}
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={editForm.control}
                name="daysOfWeek"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("adminManage.classes.daysOfWeek")}</FormLabel>
                    <FormControl>
                      <ToggleGroup
                        type="multiple"
                        variant="outline"
                        value={(field.value ?? []).map(String)}
                        onValueChange={(vals) =>
                          field.onChange(vals.map(Number))
                        }
                        className="flex-wrap justify-start"
                      >
                        {dayOptions.map((d) => (
                          <ToggleGroupItem
                            key={d.value}
                            value={String(d.value)}
                            aria-label={d.label}
                            className="data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
                          >
                            {d.label}
                          </ToggleGroupItem>
                        ))}
                      </ToggleGroup>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <FormField
                  control={editForm.control}
                  name="startTime"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        {t("adminManage.classes.startTime")}
                      </FormLabel>
                      <FormControl>
                        <Input type="time" step={300} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={editForm.control}
                  name="endTime"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("adminManage.classes.endTime")}</FormLabel>
                      <FormControl>
                        <Input type="time" step={300} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={editForm.control}
                  name="gradeTag"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        {t("adminManage.classes.gradeTagOptional")}
                      </FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <div className="space-y-2">
                <Label>{t("adminManage.classes.term")}</Label>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <FormField
                    control={editForm.control}
                    name="startDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormControl>
                          <Input
                            type="date"
                            aria-label={t("adminManage.classes.term")}
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={editForm.control}
                    name="endDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormControl>
                          <Input
                            type="date"
                            aria-label={t("adminManage.classes.term")}
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <FormField
                  control={editForm.control}
                  name="price"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("adminManage.classes.priceEGP")}</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={0}
                          step="0.01"
                          inputMode="decimal"
                          value={
                            Number.isFinite(field.value) ? field.value : ""
                          }
                          onChange={(e) =>
                            field.onChange(
                              e.target.value === ""
                                ? NaN
                                : e.target.valueAsNumber,
                            )
                          }
                          onBlur={field.onBlur}
                          name={field.name}
                          ref={field.ref}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={editForm.control}
                  name="pricePerMonth"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("adminManage.classes.pricePerMonthEGP")}</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={0}
                          step="0.01"
                          inputMode="decimal"
                          placeholder={t("adminManage.classes.planDisabled")}
                          value={Number.isFinite(field.value) ? (field.value as number) : ""}
                          onChange={(e) =>
                            field.onChange(e.target.value === "" ? undefined : e.target.valueAsNumber)
                          }
                          onBlur={field.onBlur}
                          name={field.name}
                          ref={field.ref}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={editForm.control}
                  name="pricePerSession"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("adminManage.classes.pricePerSessionEGP")}</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={0}
                          step="0.01"
                          inputMode="decimal"
                          placeholder={t("adminManage.classes.planDisabled")}
                          value={Number.isFinite(field.value) ? (field.value as number) : ""}
                          onChange={(e) =>
                            field.onChange(e.target.value === "" ? undefined : e.target.valueAsNumber)
                          }
                          onBlur={field.onBlur}
                          name={field.name}
                          ref={field.ref}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={editForm.control}
                  name="settlementBasis"
                  render={({ field }) => (
                    <FormItem className="sm:col-span-2">
                      <FormLabel>{t("adminManage.classes.settlementBasis")}</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="course_price">
                            {t("adminManage.classes.basisCoursePrice")}
                          </SelectItem>
                          <SelectItem value="session_price">
                            {t("adminManage.classes.basisSessionPrice")}
                          </SelectItem>
                          <SelectItem value="subscription">
                            {t("adminManage.classes.basisSubscription")}
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-[12px] text-ink-3">
                        {t("adminManage.classes.settlementBasisHint")}
                      </p>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={editForm.control}
                  name="maxStudents"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        {t("adminManage.classes.maxStudents")}
                      </FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={1}
                          step={1}
                          value={
                            Number.isFinite(field.value) ? field.value : ""
                          }
                          onChange={(e) =>
                            field.onChange(
                              e.target.value === ""
                                ? NaN
                                : e.target.valueAsNumber,
                            )
                          }
                          onBlur={field.onBlur}
                          name={field.name}
                          ref={field.ref}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={editForm.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      {t("adminManage.classes.descriptionOptional")}
                    </FormLabel>
                    <FormControl>
                      <Textarea rows={2} maxLength={500} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </form>
          </Form>
          <DialogFooter>
            <Button
              variant="outline"
              type="button"
              onClick={() => {
                setEditTarget(null);
                editForm.reset();
              }}
            >
              {t("actions.cancel")}
            </Button>
            <Button
              type="submit"
              form="edit-course-form"
              disabled={updateMutation.isPending}
            >
              {updateMutation.isPending ? <Spinner /> : null}
              {t("actions.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
