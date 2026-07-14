"use client";

import { useMemo, useState } from "react";
import { useList, useCreate, useUpdate, useCustom } from "@refinedev/core";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Star, Pencil, User, Users, Send } from "lucide-react";
import { useTranslations } from "next-intl";
import { useFormatters } from "@/lib/i18n/use-formatters";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@repo/ui/components/card";
import { Button } from "@repo/ui/components/button";
import { Textarea } from "@repo/ui/components/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@repo/ui/components/dialog";
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from "@repo/ui/components/form";
import { toast } from "@repo/ui/components/sonner";
import { cn } from "@repo/ui/lib/utils";
import { DataTable, type ColumnDef } from "@/components/kit/data-table";
import { StatCard } from "@/components/kit/stat-card";
import { PageHeader } from "@/components/kit/page-header";
import { EmptyState } from "@/components/kit/empty-state";
import { PageSpinner, Spinner } from "@/components/kit/spinner";

/** Row of 1–5 lucide stars (replaces AntD `Rate`): read-only display or clickable input. */
function StarRating({
  value,
  onChange,
  interactive = false,
  starClassName,
}: {
  value: number;
  onChange?: (v: number) => void;
  interactive?: boolean;
  starClassName?: string;
}) {
  const [hover, setHover] = useState(0);
  const active = interactive ? hover || value : value;
  return (
    <div
      className="flex items-center gap-1"
      role={interactive ? "radiogroup" : undefined}
    >
      {[1, 2, 3, 4, 5].map((star) => {
        const filled = star <= active;
        const glyph = (
          <Star
            className={cn(
              "size-4",
              starClassName,
              filled
                ? "fill-warning text-warning"
                : "fill-transparent text-muted-foreground/40",
            )}
          />
        );
        if (!interactive) {
          return <span key={star}>{glyph}</span>;
        }
        return (
          <button
            type="button"
            key={star}
            aria-label={String(star)}
            className="transition-transform hover:scale-110"
            onClick={() => onChange?.(star)}
            onMouseEnter={() => setHover(star)}
            onMouseLeave={() => setHover(0)}
          >
            {glyph}
          </button>
        );
      })}
    </div>
  );
}

export function StudentReviewsScreen() {
  const t = useTranslations();
  const { formatDate } = useFormatters();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingReview, setEditingReview] = useState<any>(null);
  const [selectedTeacher, setSelectedTeacher] = useState<any>(null);

  const { query: eligibleQuery, result: eligibleResult } = useCustom({
    url: "reviews/eligible",
    method: "get",
  });
  const { query: reviewsQuery, result: reviewsResult } = useList({
    resource: "reviews",
    pagination: { pageSize: 20, currentPage: 1 },
  });
  const { mutate: createReview, mutation: createMutation } = useCreate();
  const { mutate: updateReview, mutation: updateMutation } = useUpdate();

  const eligibleTeachers: any[] = Array.isArray(eligibleResult?.data)
    ? (eligibleResult.data as any[])
    : [];
  const reviews = (reviewsResult?.data ?? []) as any[];

  const schema = useMemo(
    () =>
      z.object({
        rating: z.number().min(1, t("studentReviews.ratingRequired")),
        text: z.string().max(2000).optional(),
      }),
    [t],
  );

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { rating: 0, text: "" },
  });
  const textValue = form.watch("text") ?? "";

  const handleOpenChange = (open: boolean) => {
    setIsModalOpen(open);
    if (!open) {
      form.reset({ rating: 0, text: "" });
    }
  };

  const handleOpenCreate = (teacher: any) => {
    setSelectedTeacher(teacher);
    setEditingReview(null);
    form.reset({ rating: 0, text: "" });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (review: any) => {
    setSelectedTeacher(null);
    setEditingReview(review);
    form.reset({
      rating: review.rating,
      text: review.text ?? "",
    });
    setIsModalOpen(true);
  };

  const handleSubmit = (values: { rating: number; text?: string }) => {
    if (editingReview) {
      updateReview(
        { resource: "reviews", id: editingReview.id || editingReview._id, values },
        {
          onSuccess: () => {
            toast.success(t("studentReviews.reviewUpdated"));
            setIsModalOpen(false);
            form.reset({ rating: 0, text: "" });
            reviewsQuery.refetch();
          },
          onError: (err: any) =>
            toast.error(err?.message || t("studentReviews.reviewUpdateFailed")),
        }
      );
    } else if (selectedTeacher) {
      createReview(
        {
          resource: "reviews",
          values: { teacherId: selectedTeacher.id || selectedTeacher._id, ...values },
        },
        {
          onSuccess: () => {
            toast.success(t("studentReviews.reviewSubmitted"));
            setIsModalOpen(false);
            form.reset({ rating: 0, text: "" });
            reviewsQuery.refetch();
            eligibleQuery.refetch();
          },
          onError: (err: any) =>
            toast.error(err?.message || t("studentReviews.reviewSubmitFailed")),
        }
      );
    }
  };

  const eligibleColumns: ColumnDef<any>[] = [
    {
      id: "teacher",
      header: t("roles.teacher"),
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <User className="size-4 text-muted-foreground" />
          <span>{row.original.name}</span>
        </div>
      ),
    },
    {
      accessorKey: "email",
      header: t("auth.email"),
    },
    {
      id: "actions",
      header: t("studentReviews.actions"),
      cell: ({ row }) => (
        <Button size="sm" onClick={() => handleOpenCreate(row.original)}>
          <Star className="size-4" />
          {t("studentReviews.writeReview")}
        </Button>
      ),
    },
  ];

  const reviewColumns: ColumnDef<any>[] = [
    {
      id: "teacher",
      header: t("roles.teacher"),
      cell: ({ row }) => {
        const teacher = row.original.teacherId;
        return (
          <div className="flex items-center gap-2">
            <User className="size-4 text-muted-foreground" />
            <span>{teacher?.name || t("studentReviews.unknown")}</span>
          </div>
        );
      },
    },
    {
      accessorKey: "rating",
      header: t("studentReviews.rating"),
      cell: ({ row }) => <StarRating value={row.original.rating} />,
    },
    {
      accessorKey: "text",
      header: t("studentReviews.comment"),
      cell: ({ row }) =>
        row.original.text || (
          <span className="italic text-muted-foreground">
            {t("studentReviews.noComment")}
          </span>
        ),
    },
    {
      accessorKey: "createdAt",
      header: t("studentReviews.date"),
      cell: ({ row }) =>
        row.original.createdAt ? formatDate(row.original.createdAt) : "—",
    },
    {
      id: "actions",
      header: t("studentReviews.actions"),
      cell: ({ row }) => (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => handleOpenEdit(row.original)}
        >
          <Pencil className="size-4" />
          {t("actions.edit")}
        </Button>
      ),
    },
  ];

  const modalTitle = editingReview
    ? t("studentReviews.editReview")
    : `${t("studentReviews.reviewPrefix")} ${selectedTeacher?.name || ""}`;
  const isSubmitting = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="space-y-6">
      <PageHeader title={t("nav.reviews")} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <StatCard
          label={t("studentReviews.myReviews")}
          value={reviews.length}
          icon={Star}
          accent
        />
        <StatCard
          label={t("studentReviews.eligibleTeachers")}
          value={eligibleTeachers.length}
          icon={Users}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("studentReviews.teachersToReview")}</CardTitle>
        </CardHeader>
        <CardContent>
          {eligibleQuery.isLoading ? (
            <PageSpinner />
          ) : (
            <DataTable
              columns={eligibleColumns}
              data={eligibleTeachers}
              pageSize={5}
              emptyState={
                <EmptyState
                  icon={Users}
                  title={t("studentReviews.noEligibleTeachers")}
                />
              }
            />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("studentReviews.myReviews")}</CardTitle>
        </CardHeader>
        <CardContent>
          {reviewsQuery.isLoading ? (
            <PageSpinner />
          ) : (
            <DataTable
              columns={reviewColumns}
              data={reviews}
              pageSize={10}
              emptyState={
                <EmptyState
                  icon={Star}
                  title={t("studentReviews.noReviewsYet")}
                />
              }
            />
          )}
        </CardContent>
      </Card>

      <Dialog open={isModalOpen} onOpenChange={handleOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{modalTitle}</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(handleSubmit)}
              autoComplete="off"
              className="space-y-4"
            >
              <FormField
                control={form.control}
                name="rating"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("studentReviews.rating")}</FormLabel>
                    <FormControl>
                      <StarRating
                        value={field.value}
                        onChange={field.onChange}
                        interactive
                        starClassName="size-7"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="text"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("studentReviews.comment")}</FormLabel>
                    <FormControl>
                      <Textarea
                        rows={4}
                        maxLength={2000}
                        placeholder={t("studentReviews.shareExperience")}
                        {...field}
                        value={field.value ?? ""}
                      />
                    </FormControl>
                    <div className="text-end text-xs text-muted-foreground tabular-nums">
                      <span dir="ltr">{textValue.length}/2000</span>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => handleOpenChange(false)}
                >
                  {t("actions.cancel")}
                </Button>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? <Spinner /> : <Send className="size-4" />}
                  {editingReview
                    ? t("studentReviews.update")
                    : t("studentReviews.submit")}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
