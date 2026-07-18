"use client";

import React, { useState, useMemo } from "react";
import { useList, useDelete } from "@refinedev/core";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Download, FileText, Info, Plus, Trash2, Upload } from "lucide-react";
import { useTranslations } from "next-intl";
import { api } from "@/lib/api/client";
import { asKey } from "@/lib/i18n/keys";
import { useFormatters } from "@/lib/i18n/use-formatters";
import { toast } from "@repo/ui/components/sonner";
import { cn } from "@repo/ui/lib/utils";
import { Button } from "@repo/ui/components/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import { Alert, AlertDescription, AlertTitle } from "@repo/ui/components/alert";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/select";
import { ToggleGroup, ToggleGroupItem } from "@repo/ui/components/toggle-group";
import { DataTable, type ColumnDef } from "@/components/kit/data-table";
import { StatusBadge, type StatusTone } from "@/components/kit/status-badge";
import { EmptyState } from "@/components/kit/empty-state";
import { ConfirmDialog } from "@/components/kit/confirm-dialog";
import { Spinner, PageSpinner } from "@/components/kit/spinner";

const MATERIAL_TYPE_VALUES = ["lecture", "homework", "exam", "other"] as const;

const TYPE_TONES: Record<string, StatusTone> = {
  lecture: "info",
  homework: "warning",
  exam: "danger",
  other: "neutral",
};

function formatBytes(bytes: number | null): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function TeacherMaterialsScreen() {
  const t = useTranslations();
  const { formatDate } = useFormatters();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [sourceMode, setSourceMode] = useState<"upload" | "link">("upload");

  const { query: coursesQuery, result: coursesResult } = useList({
    resource: "courses",
  });
  const { query: materialsQuery, result: materialsResult } = useList({
    resource: "materials",
    filters: selectedCourseId
      ? [
          {
            field: "courseId",
            operator: "eq" as const,
            value: selectedCourseId,
          },
        ]
      : [],
  });
  const { mutate: deleteMaterial } = useDelete();

  const courses = (coursesResult?.data ?? []) as any[];
  const materials = (materialsResult?.data ?? []) as any[];

  const materialTypeOptions = MATERIAL_TYPE_VALUES.map((v) => ({
    value: v,
    label: t(`teacher.type_${v}`),
  }));

  const courseMap = useMemo(() => {
    const map = new Map<string, string>();
    courses.forEach((c) => map.set(c.id || c._id, c.title));
    return map;
  }, [courses]);

  const courseOptions = useMemo(
    () => courses.map((c) => ({ value: c.id || c._id, label: c.title })),
    [courses],
  );

  const uploadSchema = z
    .object({
      courseId: z.string().min(1, t("teacher.selectCourseRequired")),
      title: z.string().min(1, t("teacher.titleRequired")),
      type: z.string().min(1, t("teacher.typeRequired")),
      file: z.any().optional(),
      fileUrl: z.string().optional(),
    })
    .superRefine((val, ctx) => {
      if (sourceMode === "upload") {
        if (!val.file) {
          ctx.addIssue({
            code: "custom",
            path: ["file"],
            message: t("teacher.fileRequired"),
          });
        }
      } else if (!val.fileUrl || !val.fileUrl.trim()) {
        ctx.addIssue({
          code: "custom",
          path: ["fileUrl"],
          message: t("teacher.pdfLinkRequired"),
        });
      } else if (!z.string().url().safeParse(val.fileUrl).success) {
        ctx.addIssue({
          code: "custom",
          path: ["fileUrl"],
          message: t("teacher.validUrl"),
        });
      }
    });
  type UploadValues = z.infer<typeof uploadSchema>;

  const form = useForm<UploadValues>({
    resolver: zodResolver(uploadSchema),
    defaultValues: {
      courseId: "",
      title: "",
      type: "",
      file: undefined,
      fileUrl: "",
    },
  });

  const closeModal = () => {
    setIsModalOpen(false);
    setSourceMode("upload");
    form.reset();
  };

  const handleUpload = async (values: UploadValues) => {
    let file: File | undefined;
    if (sourceMode === "upload") {
      file = (values.file as File | undefined) ?? undefined;
      if (!file) {
        toast.error(t("teacher.selectPdfError"));
        return;
      }
      if (file.type !== "application/pdf") {
        toast.error(t("teacher.onlyPdfError"));
        return;
      }
    } else if (!values.fileUrl?.trim()) {
      toast.error(t("teacher.enterLinkError"));
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
      toast.success(t("teacher.uploadSuccess"));
      setIsModalOpen(false);
      setSourceMode("upload");
      form.reset();
      materialsQuery.refetch();
    } catch (err: any) {
      toast.error(err?.message || t("teacher.uploadFailed"));
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = (id: string) => {
    deleteMaterial(
      { resource: "materials", id },
      {
        onSuccess: () => toast.success(t("teacher.deleteSuccess")),
        onError: (err: any) =>
          toast.error(err?.message || t("teacher.deleteFailed")),
      },
    );
  };

  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const handleDownload = async (id: string) => {
    setDownloadingId(id);
    try {
      const response = await api
        .get(`materials/${id}/download`)
        .json<{ data: { url: string } }>();
      window.open(response.data.url, "_blank");
    } catch (err: any) {
      toast.error(err?.message || t("teacher.downloadFailed"));
    } finally {
      setDownloadingId(null);
    }
  };

  const columns: ColumnDef<any>[] = [
    {
      id: "title",
      header: t("teacher.title"),
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <FileText className="size-4 text-destructive" />
          <span>{row.original.title}</span>
        </div>
      ),
    },
    {
      id: "course",
      header: t("nav.courses"),
      cell: ({ row }) =>
        courseMap.get(row.original.courseId?.toString?.()) || "—",
    },
    {
      id: "type",
      header: t("teacher.type"),
      cell: ({ row }) => {
        const v = row.original.type as string;
        return v ? (
          <StatusBadge tone={TYPE_TONES[v] ?? "neutral"}>
            {t(asKey(`teacher.type_${v}`))}
          </StatusBadge>
        ) : null;
      },
    },
    {
      id: "size",
      header: t("teacher.size"),
      cell: ({ row }) => formatBytes(row.original.fileSizeBytes),
    },
    {
      id: "createdAt",
      header: t("teacher.uploaded"),
      cell: ({ row }) =>
        row.original.createdAt ? formatDate(row.original.createdAt) : "—",
    },
    {
      id: "actions",
      header: t("teacher.actions"),
      cell: ({ row }) => {
        const record = row.original;
        const id = record.id || record._id;
        return (
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleDownload(id)}
              disabled={downloadingId === id}
            >
              {downloadingId === id ? (
                <Spinner />
              ) : (
                <Download className="size-4" />
              )}
              {t("teacher.download")}
            </Button>
            <ConfirmDialog
              trigger={
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 className="size-4" />
                  {t("actions.delete")}
                </Button>
              }
              title={t("teacher.deleteConfirm")}
              confirmText={t("actions.delete")}
              cancelText={t("actions.cancel")}
              destructive
              onConfirm={() => handleDelete(id)}
            />
          </div>
        );
      },
    },
  ];

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle>{t("teacher.materialsHeading")}</CardTitle>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Select
                value={selectedCourseId ?? "all"}
                onValueChange={(v) =>
                  setSelectedCourseId(v === "all" ? null : v)
                }
              >
                <SelectTrigger className="w-full sm:w-[200px]">
                  <SelectValue placeholder={t("teacher.filterByCourse")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">
                    {t("teacher.filterByCourse")}
                  </SelectItem>
                  {courseOptions.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button onClick={() => setIsModalOpen(true)}>
                <Plus className="size-4" />
                {t("teacher.uploadMaterial")}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {materialsQuery.isLoading ? (
            <PageSpinner />
          ) : (
            <DataTable
              columns={columns}
              data={materials}
              pageSize={10}
              emptyState={
                <EmptyState icon={FileText} title={t("teacher.noMaterials")} />
              }
            />
          )}
        </CardContent>
      </Card>

      <Dialog
        open={isModalOpen}
        onOpenChange={(o) => {
          if (!o) closeModal();
          else setIsModalOpen(true);
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("teacher.uploadMaterial")}</DialogTitle>
          </DialogHeader>

          <Alert className="border-info/30 bg-info/10 text-info">
            <Info className="size-4" />
            <AlertTitle>{t("teacher.pdfStorage")}</AlertTitle>
            <AlertDescription className="text-info/80">
              {t("teacher.pdfStorageDesc")}
            </AlertDescription>
          </Alert>

          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(handleUpload)}
              autoComplete="off"
              className="space-y-4"
            >
              <FormField
                control={form.control}
                name="courseId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("teacher.course")}</FormLabel>
                    <Select
                      value={field.value || undefined}
                      onValueChange={field.onChange}
                    >
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue
                            placeholder={t("teacher.selectCoursePlaceholder")}
                          />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {courseOptions.map((c) => (
                          <SelectItem key={c.value} value={c.value}>
                            {c.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("teacher.title")}</FormLabel>
                    <FormControl>
                      <Input
                        placeholder={t("teacher.titlePlaceholder")}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("teacher.type")}</FormLabel>
                    <Select
                      value={field.value || undefined}
                      onValueChange={field.onChange}
                    >
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue
                            placeholder={t("teacher.selectTypePlaceholder")}
                          />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {materialTypeOptions.map((o) => (
                          <SelectItem key={o.value} value={o.value}>
                            {o.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="space-y-2">
                <Label>{t("teacher.source")}</Label>
                <ToggleGroup
                  type="single"
                  variant="outline"
                  value={sourceMode}
                  onValueChange={(v) => {
                    if (!v) return;
                    setSourceMode(v as "upload" | "link");
                    form.setValue("file", undefined);
                    form.setValue("fileUrl", "");
                    form.clearErrors(["file", "fileUrl"]);
                  }}
                >
                  <ToggleGroupItem
                    value="upload"
                    className="data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
                  >
                    {t("teacher.uploadPdf")}
                  </ToggleGroupItem>
                  <ToggleGroupItem
                    value="link"
                    className="data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
                  >
                    {t("teacher.pdfLink")}
                  </ToggleGroupItem>
                </ToggleGroup>
              </div>

              {sourceMode === "upload" ? (
                <FormField
                  control={form.control}
                  name="file"
                  render={({ field }) => {
                    const f = field.value as File | undefined;
                    const size = f
                      ? f.size < 1024 * 1024
                        ? `${(f.size / 1024).toFixed(1)} KB`
                        : `${(f.size / (1024 * 1024)).toFixed(1)} MB`
                      : null;
                    const tooLarge = f ? f.size > 20 * 1024 * 1024 : false;
                    return (
                      <FormItem>
                        <FormLabel>{t("teacher.fileLabel")}</FormLabel>
                        <div>
                          <input
                            id="material-file"
                            type="file"
                            accept=".pdf,application/pdf"
                            className="hidden"
                            name={field.name}
                            ref={field.ref}
                            onBlur={field.onBlur}
                            onChange={(e) =>
                              field.onChange(e.target.files?.[0])
                            }
                          />
                          <Button asChild variant="outline" type="button">
                            <label
                              htmlFor="material-file"
                              className="cursor-pointer"
                            >
                              <Upload className="size-4" />
                              {t("teacher.selectPdf")}
                            </label>
                          </Button>
                        </div>
                        {f ? (
                          <p
                            className={cn(
                              "text-xs",
                              tooLarge
                                ? "text-destructive"
                                : "text-muted-foreground",
                            )}
                          >
                            {f.name} — <span dir="ltr">{size}</span>
                            {tooLarge ? ` ${t("teacher.tooLarge")}` : ""}
                          </p>
                        ) : null}
                        <FormMessage />
                      </FormItem>
                    );
                  }}
                />
              ) : (
                <FormField
                  control={form.control}
                  name="fileUrl"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("teacher.pdfLinkLabel")}</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="https://example.com/material.pdf"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              <DialogFooter>
                <Button variant="outline" type="button" onClick={closeModal}>
                  {t("actions.cancel")}
                </Button>
                <Button type="submit" disabled={uploading}>
                  {uploading ? <Spinner /> : null}
                  {t("teacher.upload")}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </>
  );
}
