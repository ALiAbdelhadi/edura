"use client";

import { useMemo, useState } from "react";
import { useList, useCreate, useUpdate, useCustom } from "@refinedev/core";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Star, Pencil, Send } from "lucide-react";
import { useTranslations } from "next-intl";
import { useFormatters } from "@/lib/i18n/use-formatters";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@repo/ui/components/dialog";
import { Textarea } from "@repo/ui/components/textarea";
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
import {
  Hairline,
  InitialsTile,
  LedgerButton,
  LedgerEmpty,
  Num,
  PageTitle,
  SectionHeading,
  Sheet,
} from "@/features/student/ledger";
import { QuerySection } from "@repo/ui/components/query-section";
import { PageSpinner, Spinner } from "@/components/kit/spinner";
import { asArray } from "@/lib/refine/as-array";
import { QUERY_FRESHNESS } from "@/lib/refine";

function StarRating({
  value,
  onChange,
  interactive = false,
  size = "size-4",
  label,
}: {
  value: number;
  onChange?: (v: number) => void;
  interactive?: boolean;
  size?: string;
  label?: string;
}) {
  const [hover, setHover] = useState(0);
  const active = interactive ? hover || value : value;

  if (!interactive) {
    return (
      <span className="inline-flex items-center gap-1" aria-label={label}>
        {[1, 2, 3, 4, 5].map((star) => (
          <Star
            key={star}
            aria-hidden
            className={cn(size, star <= active ? "fill-amber text-amber" : "text-ink-3/40")}
            style={star <= active ? undefined : { fill: "transparent" }}
          />
        ))}
      </span>
    );
  }

  return (
    <div className="flex items-center gap-1" role="radiogroup" aria-label={label}>
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          type="button"
          key={star}
          role="radio"
          aria-checked={value === star}
          aria-label={String(star)}
          className="rounded-sm transition-transform hover:scale-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--indigo)]"
          onClick={() => onChange?.(star)}
          onMouseEnter={() => setHover(star)}
          onMouseLeave={() => setHover(0)}
        >
          <Star
            aria-hidden
            className={cn(size, star <= active ? "fill-amber text-amber" : "text-ink-3/40")}
            style={star <= active ? undefined : { fill: "transparent" }}
          />
        </button>
      ))}
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
    queryOptions: QUERY_FRESHNESS.list,
  });
  const { query: reviewsQuery, result: reviewsResult } = useList({
    resource: "reviews",
    pagination: { pageSize: 20, currentPage: 1 },
    queryOptions: QUERY_FRESHNESS.list,
  });
  const { mutate: createReview, mutation: createMutation } = useCreate();
  const { mutate: updateReview, mutation: updateMutation } = useUpdate();

  const eligibleTeachers = asArray<any>(eligibleResult?.data);
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
    if (!open) form.reset({ rating: 0, text: "" });
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
    form.reset({ rating: review.rating, text: review.text ?? "" });
    setIsModalOpen(true);
  };

  const handleSubmit = (values: { rating: number; text?: string }) => {
    if (editingReview) {
      updateReview(
        { resource: "reviews", id: editingReview.id, values },
        {
          onSuccess: () => {
            toast.success(t("studentReviews.reviewUpdated"));
            setIsModalOpen(false);
            form.reset({ rating: 0, text: "" });
            reviewsQuery.refetch();
          },
          onError: (err: any) =>
            toast.error(err?.message || t("studentReviews.reviewUpdateFailed")),
        },
      );
    } else if (selectedTeacher) {
      createReview(
        {
          resource: "reviews",
          values: { teacherId: selectedTeacher.id, ...values },
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
        },
      );
    }
  };

  const modalTitle = editingReview
    ? t("studentReviews.editReview")
    : `${t("studentReviews.reviewPrefix")} ${selectedTeacher?.name || ""}`;
  const isSubmitting = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="space-y-6">
      <PageTitle title={t("nav.reviews")} subtitle={t("studentReviews.subtitle")} />

      <Sheet className="p-5">
        <SectionHeading
          title={t("studentReviews.teachersToReview")}
          action={
            eligibleTeachers.length > 0 ? (
              <Num style={{ color: "var(--ink-3)", fontSize: 13 }}>
                {eligibleTeachers.length}
              </Num>
            ) : null
          }
        />
        <div className="mt-3">
          <QuerySection
            query={eligibleQuery}
            skeleton={<PageSpinner />}
            isEmpty={eligibleTeachers.length === 0}
            empty={
              <LedgerEmpty
                title={t("studentReviews.noEligibleTeachers")}
                hint={t("studentReviews.eligibilityHint")}
              />
            }
          >
            <ul className="divide-y" style={{ borderColor: "var(--rule)" }}>
              {eligibleTeachers.map((teacher) => (
                <li
                  key={teacher.id}
                  className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0"
                >
                  <InitialsTile name={teacher.name || "?"} size={34} tone="indigo" />
                  <span
                    className="min-w-0 flex-1 truncate text-sm font-medium"
                    style={{ color: "var(--ink)" }}
                  >
                    {teacher.name}
                  </span>
                  <LedgerButton
                    variant="primary"
                    onClick={() => handleOpenCreate(teacher)}
                    aria-label={`${t("studentReviews.writeReview")} — ${teacher.name}`}
                  >
                    <Star className="size-4" aria-hidden />
                    {t("studentReviews.writeReview")}
                  </LedgerButton>
                </li>
              ))}
            </ul>
          </QuerySection>
        </div>
      </Sheet>

      <Sheet className="p-5">
        <SectionHeading
          title={t("studentReviews.myReviews")}
          action={
            reviews.length > 0 ? (
              <Num style={{ color: "var(--ink-3)", fontSize: 13 }}>{reviews.length}</Num>
            ) : null
          }
        />
        <div className="mt-3">
          <QuerySection
            query={reviewsQuery}
            skeleton={<PageSpinner />}
            isEmpty={reviews.length === 0}
            empty={<LedgerEmpty title={t("studentReviews.noReviewsYet")} />}
          >
            <ul>
              {reviews.map((review, i) => {
                const teacher = review.teacherId;
                return (
                  <li key={review.id}>
                    {i > 0 ? <Hairline /> : null}
                    <div className="flex flex-col gap-2 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <InitialsTile name={teacher?.name || "?"} size={30} tone="indigo" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium" style={{ color: "var(--ink)" }}>
                            {teacher?.name || t("studentReviews.unknown")}
                          </p>
                          <div className="mt-0.5 flex items-center gap-2">
                            <StarRating
                              value={review.rating}
                              label={t("studentReviews.ratingOutOf", { rating: review.rating })}
                            />
                            <span className="text-xs" style={{ color: "var(--ink-3)" }}>
                              {review.createdAt ? formatDate(review.createdAt) : "—"}
                            </span>
                          </div>
                        </div>
                        <LedgerButton
                          onClick={() => handleOpenEdit(review)}
                          aria-label={`${t("actions.edit")} — ${teacher?.name ?? ""}`}
                        >
                          <Pencil className="size-4" aria-hidden />
                          {t("actions.edit")}
                        </LedgerButton>
                      </div>

                      <p
                        className="ps-[38px] text-sm leading-snug"
                        style={{ color: review.text ? "var(--ink-2)" : "var(--ink-3)" }}
                      >
                        {review.text || t("studentReviews.noComment")}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </QuerySection>
        </div>
      </Sheet>

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
                        size="size-7"
                        label={t("studentReviews.rating")}
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
                    <div className="text-end">
                      <Num style={{ color: "var(--ink-3)", fontSize: 11 }}>
                        {textValue.length}/2000
                      </Num>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <DialogFooter>
                <LedgerButton type="button" onClick={() => handleOpenChange(false)}>
                  {t("actions.cancel")}
                </LedgerButton>
                <LedgerButton variant="primary" type="submit" disabled={isSubmitting}>
                  {isSubmitting ? <Spinner /> : <Send className="size-4" aria-hidden />}
                  {editingReview ? t("studentReviews.update") : t("studentReviews.submit")}
                </LedgerButton>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
