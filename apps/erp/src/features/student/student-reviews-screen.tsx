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
  InitialsTile,
  LedgerButton,
  LedgerEmpty,
  LedgerTable,
  Num,
  PageTitle,
  SectionHeading,
  Sheet,
  Td,
  Th,
  Tr,
} from "@/features/student/ledger";
import { PageSpinner, Spinner } from "@/components/kit/spinner";
import { asArray } from "@/lib/refine/as-array";

/**
 * Reviews — one of the very few surfaces where a student WRITES rather than is
 * written into, so §3's "be explicit about agency" is the whole brief: the
 * action is present and direct, and the thing they wrote is theirs to correct.
 *
 * REBUILT ONTO THE LEDGER KIT. This was the last student screen still drawn in
 * shadcn `Card` + `DataTable` + `Button` while every neighbouring screen used
 * `Sheet` / `SectionHeading` / `LedgerTable` — two design languages one nav
 * click apart, which is what made this page read as a different product.
 *
 * TWO THINGS WENT, AND NEITHER WAS A CAPABILITY:
 *
 * 1. The two counter cards. They sat directly above the two lists they counted,
 *    so the page stated the same two numbers twice within one screen — the
 *    duplication rule the parent and student portals were already swept for.
 *    The count now rides in each section's own heading, where the list it
 *    describes begins.
 * 2. The eligible-teachers EMAIL column. A student picks their teacher by name;
 *    they have never needed the address, and printing every teacher's email
 *    into a minor's screen is a disclosure with no reader. That also freed the
 *    list from being a table at all — it is three fields and a button, so it is
 *    a list.
 */

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

  // Read-only: ONE accessible statement ("4 out of 5"), not five unlabelled
  // glyphs a screen reader has to count.
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
          // `radiogroup` with plain buttons inside was a lie about what the
          // control is; each star is the radio it always looked like.
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
  });
  const { query: reviewsQuery, result: reviewsResult } = useList({
    resource: "reviews",
    pagination: { pageSize: 20, currentPage: 1 },
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
        },
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

      {/* ── Waiting on you ─────────────────────────────────────────────────── */}
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
          {eligibleQuery.isLoading ? (
            <PageSpinner />
          ) : eligibleTeachers.length === 0 ? (
            /* Not "no results" — a REQUIREMENT, and it names the one thing that
               satisfies it, so the empty state is a next step rather than a
               dead end. */
            <LedgerEmpty
              title={t("studentReviews.noEligibleTeachers")}
              hint={t("studentReviews.eligibilityHint")}
            />
          ) : (
            <ul className="divide-y" style={{ borderColor: "var(--rule)" }}>
              {eligibleTeachers.map((teacher) => (
                <li
                  key={teacher.id || teacher._id}
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
          )}
        </div>
      </Sheet>

      {/* ── What you said — yours, and yours to correct ─────────────────────── */}
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
          {reviewsQuery.isLoading ? (
            <PageSpinner />
          ) : reviews.length === 0 ? (
            <LedgerEmpty title={t("studentReviews.noReviewsYet")} />
          ) : (
            <LedgerTable
              head={
                <>
                  <Th>{t("roles.teacher")}</Th>
                  <Th>{t("studentReviews.rating")}</Th>
                  <Th>{t("studentReviews.comment")}</Th>
                  <Th>{t("studentReviews.date")}</Th>
                  <Th align="end">
                    <span className="sr-only">{t("studentReviews.actions")}</span>
                  </Th>
                </>
              }
            >
              {reviews.map((review) => {
                const teacher = review.teacherId;
                return (
                  <Tr key={review.id || review._id}>
                    <Td>
                      <div className="flex items-center gap-2.5">
                        <InitialsTile
                          name={teacher?.name || "?"}
                          size={28}
                          tone="indigo"
                        />
                        <span className="font-medium">
                          {teacher?.name || t("studentReviews.unknown")}
                        </span>
                      </div>
                    </Td>
                    <Td>
                      <StarRating
                        value={review.rating}
                        label={t("studentReviews.ratingOutOf", { rating: review.rating })}
                      />
                    </Td>
                    {/* The one cell allowed to wrap: a comment is prose, and
                        truncating what the student themself wrote is the one
                        piece of text on this page they cannot re-read elsewhere. */}
                    <Td className="max-w-[36ch] whitespace-normal">
                      {review.text || (
                        <span style={{ color: "var(--ink-3)" }}>
                          {t("studentReviews.noComment")}
                        </span>
                      )}
                    </Td>
                    <Td>
                      <Num style={{ color: "var(--ink-2)", fontSize: 12 }}>
                        {review.createdAt ? formatDate(review.createdAt) : "—"}
                      </Num>
                    </Td>
                    <Td align="end">
                      <LedgerButton
                        onClick={() => handleOpenEdit(review)}
                        aria-label={`${t("actions.edit")} — ${teacher?.name ?? ""}`}
                      >
                        <Pencil className="size-4" aria-hidden />
                        {t("actions.edit")}
                      </LedgerButton>
                    </Td>
                  </Tr>
                );
              })}
            </LedgerTable>
          )}
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
