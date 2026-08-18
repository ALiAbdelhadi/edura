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
import { toast } from "@repo/ui/components/sonner";
import {
  Chip,
  Eyebrow,
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
import { asKey } from "@/lib/i18n/keys";
import { useFormatters } from "@/lib/i18n/use-formatters";

/**
 * The family code — how a parent comes to be able to read this student's record.
 *
 * REBUILT ONTO THE LEDGER KIT, for the same reason as the reviews screen: it was
 * three stacked shadcn `Card`s and a `DataTable` in a portal built from `Sheet`
 * and `LedgerTable`.
 *
 * FOUR THINGS WERE WRONG BEYOND THE KIT:
 *
 * 1. The page title was printed twice — `<PageTitle>` read "رمز العائلة" and the
 *    first card's heading read "رمز العائلة" directly beneath it. A section
 *    heading that restates the page title is furniture, so the code sheet now
 *    labels the FIGURE ("your code") rather than re-announcing the page.
 * 2. The code was drawn in a raw `font-mono tracking-widest` span. It is an
 *    identifier, which is exactly what `<Num>` exists for — and `<Num>` is also
 *    what isolates it from the surrounding Arabic, so a bare span is a latent
 *    bidi break as well as a drifted style. `tracking-widest` also went: the
 *    code is read aloud across a room and spacing it out helps, but the Ledger
 *    already sets mono figures with tabular numerals.
 * 3. `activeTab` was declared, set nowhere, read nowhere.
 * 4. Approve and reject were two equal-weight ghost buttons side by side.
 *    Approving grants an adult permanent read access to a minor's record; the
 *    two are not peers, so approve is the primary and reject is the quiet one.
 */

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
  _id?: string;
  status?: string;
  initiatedBy?: string;
  createdAt?: string;
  parentId?: { name?: string } | null;
};

export function StudentFamilyCodeScreen() {
  const t = useTranslations();
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

  /* The field is labelled "email OR phone" and `POST /parent-links` accepts
     either — but the client schema was `.email()`, so every phone number the
     label invited was refused before it left the browser. Constitution §3:
     never imply an action that will be refused. The permissive phone shape is
     deliberate (the server is the authority on what it accepts); this only has
     to stop an obvious typo from being posted. */
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

      {/* ── The code itself ────────────────────────────────────────────────── */}
      <Sheet className="p-5">
        <Eyebrow>{t("studentFamilyCode.yourCode")}</Eyebrow>
        {codeQuery.isLoading ? (
          <PageSpinner />
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
              {/* Rotating is not destructive to an APPROVED link, and a student
                  who thinks it might be will never rotate a leaked code. */}
              <p className="text-xs" style={{ color: "var(--ink-3)" }}>
                {t("studentFamilyCode.rotateHint")}
              </p>
            </div>
          </div>
        )}
      </Sheet>

      {/* ── Invite a parent yourself ───────────────────────────────────────── */}
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

      {/* ── Who has asked, and who can read ────────────────────────────────── */}
      <Sheet className="p-5">
        <SectionHeading title={t("studentFamilyCode.linkRequests")} />
        <div className="mt-3">
          {linksQuery.isLoading ? (
            <PageSpinner />
          ) : links.length === 0 ? (
            <LedgerEmpty
              title={t("studentFamilyCode.noLinkRequests")}
              hint={t("studentFamilyCode.noLinkRequestsHint")}
            />
          ) : (
            <LedgerTable
              head={
                <>
                  <Th>{t("roles.parent")}</Th>
                  <Th>{t("studentFamilyCode.status")}</Th>
                  <Th>{t("studentFamilyCode.initiatedBy")}</Th>
                  <Th>{t("studentFamilyCode.date")}</Th>
                  <Th align="end">
                    <span className="sr-only">{t("studentFamilyCode.actions")}</span>
                  </Th>
                </>
              }
            >
              {links.map((link) => {
                const id = link.id || link._id || "";
                const name = link.parentId?.name || t("studentFamilyCode.unknown");
                const decidable = link.status === "pending" && link.initiatedBy === "parent";
                return (
                  <Tr key={id}>
                    <Td>
                      <div className="flex items-center gap-2.5">
                        <InitialsTile name={name} size={28} tone="teal" />
                        <span className="font-medium">{name}</span>
                      </div>
                    </Td>
                    <Td>
                      <Chip tone={(link.status && STATUS_TONES[link.status]) || "neutral"}>
                        {link.status ? t(asKey(STATUS_KEYS[link.status] || link.status)) : "—"}
                      </Chip>
                    </Td>
                    <Td>
                      {link.initiatedBy === "parent"
                        ? t("roles.parent")
                        : t("studentFamilyCode.you")}
                    </Td>
                    <Td>
                      <Num style={{ color: "var(--ink-2)", fontSize: 12 }}>
                        {link.createdAt ? formatDate(link.createdAt) : "—"}
                      </Num>
                    </Td>
                    <Td align="end">
                      {decidable ? (
                        <div className="flex items-center justify-end gap-2">
                          {/* Approving hands an adult standing read access to a
                              minor's record. It is the consequential one, so it
                              is the primary and reject is the quiet neighbour —
                              not two identical ghost buttons. */}
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
                      ) : (
                        <span style={{ color: "var(--ink-3)" }}>—</span>
                      )}
                    </Td>
                  </Tr>
                );
              })}
            </LedgerTable>
          )}
        </div>
      </Sheet>
    </div>
  );
}
