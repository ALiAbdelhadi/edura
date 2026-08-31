"use client";

import { useMemo, useState } from "react";
import { useList, useCreate, useCustom, useCustomMutation } from "@refinedev/core";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { RefreshCw, Link2, Copy, Check, CheckCircle2, XCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { Input } from "@repo/ui/components/input";
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from "@repo/ui/components/form";
import { LoadError } from "@repo/ui/components/ledger";
import { useQueryStrings } from "@repo/ui/components/query-section";
import { toast } from "@repo/ui/components/sonner";
import {
  Chip,
  Eyebrow,
  Hairline,
  InitialsTile,
  LedgerButton,
  LedgerEmpty,
  Num,
  PageTitle,
  SectionHeading,
  Sheet,
} from "@/features/student/ledger";
import { PageSpinner, Spinner } from "@/components/kit/spinner";
import { asKey } from "@/lib/i18n/keys";
import { useFormatters } from "@/lib/i18n/use-formatters";

const STATUS_TONES: Record<string, "amber" | "teal" | "red" | "neutral"> = {
  pending: "amber",
  approved: "teal",
  rejected: "red",
  revoked: "neutral",
};

const STATUS_KEYS: Record<string, string> = {
  pending: "status.pending",
  approved: "status.approved",
  rejected: "status.rejected",
  revoked: "studentFamilyCode.revoked",
};

type ParentLink = {
  id?: string;
  status?: string;
  initiatedBy?: string;
  createdAt?: string;
  parentId?: { name?: string } | null;
};

export function StudentFamilyCodeScreen() {
  const t = useTranslations();
  const queryStrings = useQueryStrings();
  const { formatDate } = useFormatters();
  const [copied, setCopied] = useState(false);

  const { query: codeQuery, result: codeResult } = useCustom({
    url: "me/family-code",
    method: "get",
  });
  const { mutate: rotateCode, mutation: rotateMutation } = useCustomMutation();
  const { query: linksQuery, result: linksResult } = useList({ resource: "parent-links" });
  const { mutate: createLink, mutation: createMutation } = useCreate();
  const { mutate: approveMut, mutation: approveMutation } = useCustomMutation();
  const { mutate: rejectMut, mutation: rejectMutation } = useCustomMutation();

  const code = (codeResult?.data as any)?.code ?? "—";
  const links = (linksResult?.data ?? []) as ParentLink[];

  const schema = useMemo(
    () =>
      z.object({
        contact: z
          .string()
          .trim()
          .min(1, t("studentFamilyCode.contactRequired"))
          .refine(
            (v) => v.includes("@") || /^[+\d][\d\s-]{6,}$/.test(v),
            t("studentFamilyCode.invalidContact"),
          ),
      }),
    [t],
  );

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { contact: "" },
  });

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  const handleRotate = () => {
    rotateCode(
      { url: "me/family-code/rotate", method: "post", values: {} },
      {
        onSuccess: () => {
          toast.success(t("studentFamilyCode.codeRotated"));
          codeQuery.refetch();
        },
        onError: (err: any) =>
          toast.error(err?.message || t("studentFamilyCode.codeRotateFailed")),
      },
    );
  };

  const handleInitiate = (values: { contact: string }) => {
    const contact = values.contact.trim();
    createLink(
      {
        resource: "parent-links",
        values: contact.includes("@") ? { email: contact } : { phone: contact },
      },
      {
        onSuccess: () => {
          toast.success(t("studentFamilyCode.linkRequestSent"));
          form.reset({ contact: "" });
          linksQuery.refetch();
        },
        onError: (err: any) =>
          toast.error(err?.message || t("studentFamilyCode.linkRequestFailed")),
      },
    );
  };

  const handleApprove = (id: string) => {
    approveMut(
      { url: `parent-links/${id}/approve`, method: "post", values: {} },
      {
        onSuccess: () => {
          toast.success(t("studentFamilyCode.linkApproved"));
          linksQuery.refetch();
        },
        onError: (err: any) =>
          toast.error(err?.message || t("studentFamilyCode.linkApproveFailed")),
      },
    );
  };

  const handleReject = (id: string) => {
    rejectMut(
      { url: `parent-links/${id}/reject`, method: "post", values: {} },
      {
        onSuccess: () => {
          toast.success(t("studentFamilyCode.linkRejected"));
          linksQuery.refetch();
        },
        onError: (err: any) =>
          toast.error(err?.message || t("studentFamilyCode.linkRejectFailed")),
      },
    );
  };

  return (
    <div className="space-y-6">
      <PageTitle title={t("nav.family")} subtitle={t("studentFamilyCode.subtitle")} />

      <Sheet className="p-5">
        <Eyebrow>{t("studentFamilyCode.yourCode")}</Eyebrow>
        {codeQuery.isLoading ? (
          <PageSpinner />
        ) : codeQuery.isError ? (
          <LoadError
            className="mt-2"
            message={queryStrings.loadFailed}
            onRetry={() => codeQuery.refetch()}
            retryLabel={queryStrings.retry}
          />
        ) : (
          <div className="mt-2 flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <Num style={{ fontSize: 30, fontWeight: 600, color: "var(--ink)" }}>
                {code}
              </Num>
              <LedgerButton
                onClick={handleCopy}
                aria-label={t("studentFamilyCode.copyCode")}
              >
                {copied ? (
                  <Check className="size-4" style={{ color: "var(--teal)" }} aria-hidden />
                ) : (
                  <Copy className="size-4" aria-hidden />
                )}
                {copied ? t("studentFamilyCode.copied") : t("studentFamilyCode.copyCode")}
              </LedgerButton>
            </div>
            <p className="max-w-[60ch] text-sm" style={{ color: "var(--ink-2)" }}>
              {t("studentFamilyCode.shareCodeHint")}
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <LedgerButton onClick={handleRotate} disabled={rotateMutation.isPending}>
                {rotateMutation.isPending ? <Spinner /> : <RefreshCw className="size-4" aria-hidden />}
                {t("studentFamilyCode.rotateCode")}
              </LedgerButton>
              <p className="text-xs" style={{ color: "var(--ink-3)" }}>
                {t("studentFamilyCode.rotateHint")}
              </p>
            </div>
          </div>
        )}
      </Sheet>

      <Sheet className="p-5">
        <SectionHeading title={t("studentFamilyCode.linkParent")} />
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleInitiate)} autoComplete="off" className="mt-3">
            <FormField
              control={form.control}
              name="contact"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("studentFamilyCode.parentEmailOrPhone")}</FormLabel>
                  <div className="flex flex-wrap items-start gap-2">
                    <div className="min-w-[16rem] flex-1">
                      <FormControl>
                        <Input
                          placeholder={t("studentFamilyCode.contactPlaceholder")}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </div>
                    <LedgerButton
                      variant="primary"
                      type="submit"
                      disabled={createMutation.isPending}
                    >
                      {createMutation.isPending ? <Spinner /> : <Link2 className="size-4" aria-hidden />}
                      {t("studentFamilyCode.sendRequest")}
                    </LedgerButton>
                  </div>
                </FormItem>
              )}
            />
          </form>
        </Form>
      </Sheet>

      <Sheet className="p-5">
        <SectionHeading title={t("studentFamilyCode.linkRequests")} />
        <div className="mt-3">
          {linksQuery.isLoading ? (
            <PageSpinner />
          ) : linksQuery.isError ? (
            <LoadError
              message={queryStrings.loadFailed}
              onRetry={() => linksQuery.refetch()}
              retryLabel={queryStrings.retry}
            />
          ) : links.length === 0 ? (
            <LedgerEmpty
              title={t("studentFamilyCode.noLinkRequests")}
              hint={t("studentFamilyCode.noLinkRequestsHint")}
            />
          ) : (
            <ul>
              {links.map((link, i) => {
                const id = link.id || "";
                const name = link.parentId?.name || t("studentFamilyCode.unknown");
                const decidable = link.status === "pending" && link.initiatedBy === "parent";
                return (
                  <li key={id}>
                    {i > 0 ? <Hairline /> : null}
                    <div className="flex flex-col gap-3 py-3.5 sm:flex-row sm:items-center">
                      <div className="flex min-w-0 flex-1 items-center gap-2.5">
                        <InitialsTile name={name} size={30} tone="teal" />
                        <div className="min-w-0">
                          <p className="truncate font-medium" style={{ color: "var(--ink)" }}>
                            {name}
                          </p>
                          <p className="mt-0.5 text-xs" style={{ color: "var(--ink-3)" }}>
                            {link.initiatedBy === "parent"
                              ? t("roles.parent")
                              : t("studentFamilyCode.you")}
                            {link.createdAt ? (
                              <>
                                {" · "}
                                {formatDate(link.createdAt)}
                              </>
                            ) : null}
                          </p>
                        </div>
                        <Chip tone={(link.status && STATUS_TONES[link.status]) || "neutral"}>
                          {link.status ? t(asKey(STATUS_KEYS[link.status] || link.status)) : "—"}
                        </Chip>
                      </div>

                      {decidable ? (
                        <div className="flex shrink-0 items-center gap-2">
                          <LedgerButton
                            variant="primary"
                            onClick={() => handleApprove(id)}
                            disabled={approveMutation.isPending}
                            aria-label={`${t("actions.approve")} — ${name}`}
                          >
                            {approveMutation.isPending ? <Spinner /> : <CheckCircle2 className="size-4" aria-hidden />}
                            {t("actions.approve")}
                          </LedgerButton>
                          <LedgerButton
                            onClick={() => handleReject(id)}
                            disabled={rejectMutation.isPending}
                            aria-label={`${t("actions.reject")} — ${name}`}
                          >
                            {rejectMutation.isPending ? <Spinner /> : <XCircle className="size-4" aria-hidden />}
                            {t("actions.reject")}
                          </LedgerButton>
                        </div>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </Sheet>
    </div>
  );
}
