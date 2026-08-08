import { Container } from "@/components/kit/container";
import { Plate } from "@/components/media/plate";
import { routing } from "@/i18n/routing";
import type { Locale } from "@/lib/i18n";
import { Button } from "@repo/ui/components/button";
import { EmptyState } from "@repo/ui/components/empty-state";
import { Eyebrow } from "@repo/ui/components/eyebrow";
import { Input } from "@repo/ui/components/input";
import { Skeleton } from "@repo/ui/components/skeleton";
import { StatusBadge } from "@repo/ui/components/status-badge";
import { Wordmark } from "@repo/ui/components/wordmark";
import { FileX2, Lock } from "lucide-react";
import { setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

/* The component state sheet.
   ══════════════════════════════════════════════════════════════════════════════

   Every state the direction specifies, on one page, in whichever locale and
   theme you load it in. It exists so that "all states covered" is something you
   can LOOK at rather than take on trust — and so the RTL worst case (an Arabic
   name, a Latin `TRX-` code and a 7-digit amount in one row) is a thing that
   renders, not a paragraph in a report.

   DEV ONLY. It is gated the same way the portals gate their quick-login tiles,
   because a design-system dump is not a page the marketing site should serve to
   the public — and an unlinked route is not the same as an absent one. */

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t py-9" style={{ borderColor: "var(--rule)" }}>
      <div
        className="num mb-5 text-[10px] font-semibold tracking-[0.12em] uppercase"
        style={{ color: "var(--ink-3)" }}
      >
        {title}
      </div>
      {children}
    </section>
  );
}

export default async function DesignSystemPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  if (process.env.NODE_ENV === "production") notFound();

  const { locale: raw } = await params;
  setRequestLocale(raw);
  const locale = raw as Locale;
  const arabic = locale === "ar";

  return (
    <main id="content">
      <Container className="py-12">
        <h1
          style={{
            fontFamily: arabic ? "var(--ar-display)" : "var(--lat-display)",
            fontWeight: arabic ? 700 : 400,
            fontSize: 40,
            lineHeight: arabic ? 1.34 : 1.06,
            letterSpacing: arabic ? undefined : "var(--lat-display-track)",
            color: "var(--ink)",
          }}
        >
          {arabic ? "ورقة الحالات" : "Component states"}
        </h1>

        <Section title="Wordmark">
          <div className="flex flex-wrap items-center gap-x-10 gap-y-6">
            <Wordmark locale="en" size={26} />
            <Wordmark locale="ar" size={26} />
            <span
              className="inline-flex items-center rounded-(--radius-step-md) px-4 py-3"
              style={{ backgroundColor: "var(--ink)" }}
            >
              <Wordmark locale={locale} size={26} tone="reverse" />
            </span>
          </div>
        </Section>

        <Section title="Buttons">
          <div className="flex flex-wrap items-center gap-[9px]">
            <Button variant="ledger" size="ledger">
              {arabic ? "أساسي" : "Primary"}
            </Button>
            <Button variant="gold" size="ledger">
              {arabic ? "ثانوي" : "Secondary"}
            </Button>
            <Button variant="ledger-ghost" size="ledger">
              {arabic ? "شفاف" : "Ghost"}
            </Button>
            <Button variant="ledger" size="ledger" disabled>
              {arabic ? "معطّل" : "Disabled"}
            </Button>
            <Button variant="ledger" size="ledger" loading>
              {arabic ? "جارٍ الحفظ" : "Loading"}
            </Button>
          </div>

          <div className="mt-4">
            <div className="num mb-2 text-[9px] tracking-[0.1em] uppercase" style={{ color: "var(--ink-3)" }}>
              The button carries its own amount
            </div>
            {/* The figure is mono and bidi-isolated INSIDE the label, so the
                amount stays readable in an Arabic sentence. */}
            <Button variant="money" size="ledger-money">
              {arabic ? "تأكيد دفع" : "Confirm payment of"}
              <span className="num ltr-island">300.00 EGP</span>
            </Button>
          </div>
        </Section>

        <Section title="Inputs">
          <div className="grid max-w-xl gap-4 sm:grid-cols-2">
            <Input placeholder={arabic ? "اسم الطالب" : "Student name"} />
            <Input
              aria-invalid
              defaultValue="01x-not-a-phone"
              aria-describedby="err"
            />
            <p id="err" className="-mt-2 text-[12px]" style={{ color: "var(--red)" }}>
              {arabic ? "رقم غير صالح" : "Not a valid number"}
            </p>
          </div>
        </Section>

        <Section title="Badges">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge tone="paid" script="latin">PAID</StatusBadge>
            <StatusBadge tone="pending" script="latin" age="2m">QUEUED</StatusBadge>
            <StatusBadge tone="rejected" script="latin">REVOKED</StatusBadge>
            <StatusBadge tone="active" script="latin">ENROLLED</StatusBadge>
            <StatusBadge tone="neutral" script="latin">DRAFT</StatusBadge>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {/* The same badges in Arabic — body face, never mono. */}
            <StatusBadge tone="paid">مدفوع</StatusBadge>
            <StatusBadge tone="pending" age="٢ د">في الانتظار</StatusBadge>
            <StatusBadge tone="rejected" reason="رصيد غير كافٍ">مرفوض</StatusBadge>
          </div>
        </Section>

        <Section title="Table · RTL worst case">
          <div className="overflow-x-auto rounded-(--radius-step-lg) border" style={{ borderColor: "var(--rule)" }}>
            <table className="w-full text-[13px]" style={{ borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {[
                    arabic ? "الطالب" : "Student",
                    arabic ? "المرجع" : "Reference",
                    arabic ? "المبلغ" : "Amount",
                  ].map((h, i) => (
                    <th
                      key={h}
                      className="num h-[34px] px-3 text-[10px] font-semibold tracking-[0.12em] uppercase"
                      style={{
                        backgroundColor: "var(--field)",
                        color: "var(--ink-3)",
                        // Numeric columns are END-aligned in both directions.
                        textAlign: i === 2 ? "end" : "start",
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  ["سارة منير عبد الرحمن", "TRX-2026-0431", "1,234,567.00"],
                  ["Ahmed Farouk", "TRX-2026-0432", "300.00"],
                ].map(([name, ref, amount]) => (
                  <tr key={ref} style={{ borderTop: "1px solid var(--rule-2)" }}>
                    <td className="px-3 py-[7px]" style={{ color: "var(--ink)" }}>{name}</td>
                    {/* A Latin code inside an Arabic row: isolated, or the
                        `TRX-` prefix migrates to the wrong end. */}
                    <td className="num ltr-island px-3 py-[7px]" style={{ color: "var(--ink-2)" }}>
                      {ref}
                    </td>
                    <td
                      className="num ltr-island px-3 py-[7px]"
                      style={{ color: "var(--ink)", textAlign: "end" }}
                    >
                      {amount}
                    </td>
                  </tr>
                ))}
                <tr>
                  <td className="rule-total px-3 py-[7px] font-semibold" style={{ color: "var(--ink)" }}>
                    {arabic ? "الإجمالي" : "Total"}
                  </td>
                  <td className="rule-total" />
                  <td
                    className="num ltr-island rule-total px-3 py-[7px] font-semibold"
                    style={{ color: "var(--ink)", textAlign: "end" }}
                  >
                    1,234,867.00
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </Section>

        <Section title="Empty · loading · permission">
          <div className="grid gap-5 lg:grid-cols-3">
            <EmptyState
              icon={FileX2}
              title={arabic ? "لا توجد مدفوعات بعد" : "No payments yet"}
              description={arabic ? "أول دفعة هتظهر هنا." : "The first payment will appear here."}
              action={
                <Button variant="ledger" size="ledger">
                  {arabic ? "تسجيل دفعة" : "Record a payment"}
                </Button>
              }
            />
            <div
              className="rounded-(--radius-step-lg) border p-5"
              style={{ borderColor: "var(--rule)" }}
            >
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="mt-3 h-4 w-full" />
              <Skeleton className="mt-3 h-4 w-1/2" />
            </div>
            <EmptyState
              tone="denied"
              icon={Lock}
              title={arabic ? "تحتاج صلاحية المدير" : "Needs the manager permission"}
              description={
                arabic
                  ? "الصفوف موجودة — حسابك لا يقرأ التسويات."
                  : "The rows exist. Your account cannot read settlements."
              }
            />
          </div>
        </Section>

        <Section title="Eyebrow">
          <div className="flex flex-wrap items-center gap-8">
            <Eyebrow locale={locale}>{arabic ? "في التطبيق" : "In the app"}</Eyebrow>
            <Eyebrow locale={locale} tone="gold">
              {arabic ? "على الموقع" : "On the site"}
            </Eyebrow>
          </div>
        </Section>

        <Section title="Plate">
          <div className="max-w-md">
            <Plate
              path="/dashboard/admin/counter"
              note={arabic ? "الكاونتر" : "The counter"}
            >
              <div
                className="grid h-40 place-items-center"
                style={{ backgroundColor: "var(--sheet)", color: "var(--ink-3)" }}
              >
                <span className="num text-[11px]">screenshot</span>
              </div>
            </Plate>
          </div>
        </Section>
      </Container>
    </main>
  );
}
