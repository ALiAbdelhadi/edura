"use client";

import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@repo/ui/components/dropdown-menu";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import { Separator } from "@repo/ui/components/separator";
import { toast } from "@repo/ui/components/sonner";

const TOKEN_SWATCHES: { name: string; className: string }[] = [
  { name: "background", className: "bg-background border border-border" },
  { name: "card", className: "bg-card border border-border" },
  { name: "primary", className: "bg-primary" },
  { name: "secondary", className: "bg-secondary" },
  { name: "muted", className: "bg-muted" },
  { name: "accent", className: "bg-accent" },
  { name: "brand-teal", className: "bg-brand-teal" },
  { name: "success", className: "bg-success" },
  { name: "warning", className: "bg-warning" },
  { name: "info", className: "bg-info" },
  { name: "destructive", className: "bg-destructive" },
  { name: "ring", className: "bg-ring" },
];

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h2>
      {children}
    </section>
  );
}

export function UiPreviewScreen() {
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <div className="mx-auto flex max-w-5xl flex-col gap-10 px-6 py-12">
        <header className="flex flex-col gap-2">
          <span className="text-xs font-medium uppercase tracking-widest text-brand-teal">
            @repo/ui · design system
          </span>
          <h1 className="text-3xl font-bold tracking-tight">
            EduConnect component gallery · معرض المكوّنات
          </h1>
          <p className="max-w-prose text-muted-foreground">
            shadcn/ui (Radix · new-york) on the Deep Trust tokens. Toggle the OS
            / app theme to see dark mode; the page inherits <code>dir</code>{" "}
            from the locale, so <code>/ar</code> renders RTL and{" "}
            <code>/en</code> LTR.
          </p>
        </header>

        <Section title="Tokens">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
            {TOKEN_SWATCHES.map((s) => (
              <div key={s.name} className="flex flex-col gap-1.5">
                <div className={`h-12 rounded-md ${s.className}`} />
                <span className="font-mono text-xs text-muted-foreground">
                  {s.name}
                </span>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Buttons">
          <div className="flex flex-wrap items-center gap-3">
            <Button>حفظ · Save</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="link">Link</Button>
            <Button variant="destructive">Delete</Button>
            <Button
              className="bg-brand-teal text-brand-teal-foreground hover:bg-brand-teal/90"
              variant="default"
            >
              Teal CTA
            </Button>
            <Button size="sm">Small</Button>
            <Button size="lg">Large</Button>
            <Button disabled>Disabled</Button>
          </div>
        </Section>

        <Section title="Badges / status chips">
          <div className="flex flex-wrap items-center gap-2">
            <Badge>Default</Badge>
            <Badge variant="secondary">Secondary</Badge>
            <Badge variant="outline">Outline</Badge>
            <Badge variant="destructive">Overdue</Badge>
            <Badge className="border-transparent bg-success text-success-foreground">
              مكتمل · Completed
            </Badge>
            <Badge className="border-transparent bg-warning text-warning-foreground">
              Pending
            </Badge>
            <Badge className="border-transparent bg-info text-info-foreground">
              In progress
            </Badge>
          </div>
        </Section>

        <Section title="Inputs & overlays">
          <div className="grid gap-6 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="q">بحث سريع · Quick search</Label>
              <Input id="q" placeholder="ابحث عن سنتر، كود، أو مدير…" />
              <Label htmlFor="email" className="mt-2">
                Email
              </Label>
              <Input id="email" type="email" placeholder="you@example.com" />
            </div>
            <div className="flex items-start gap-3">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline">الإجراءات · Actions</Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuLabel>Manage</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem>تعديل · Edit</DropdownMenuItem>
                  <DropdownMenuItem>Duplicate</DropdownMenuItem>
                  <DropdownMenuItem variant="destructive">
                    حذف · Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </Section>

        <Section title="Toasts (sonner)">
          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="outline"
              onClick={() =>
                toast.success("تم حفظ التغييرات", {
                  description: "Saved · the roster is up to date.",
                })
              }
            >
              Success
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                toast.error("فشل الدفع", {
                  description: "Payment declined — try another card.",
                })
              }
            >
              Error
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                toast.warning("الحصة على وشك البدء", {
                  description: "Session starts in 5 minutes.",
                })
              }
            >
              Warning
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                toast.info("تم تحديث الجدول", {
                  description: "The schedule changed since you last looked.",
                })
              }
            >
              Info
            </Button>
            <Button
              variant="outline"
              onClick={() => toast.loading("جارٍ المزامنة… · Syncing…")}
            >
              Loading
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                toast("رسالة عادية · Plain toast", {
                  description: "With an action and a cancel button.",
                  action: { label: "تراجع", onClick: () => {} },
                  cancel: { label: "إغلاق", onClick: () => {} },
                })
              }
            >
              With actions
            </Button>
          </div>
        </Section>

        <Section title="Cards (KPI)">
          <div className="grid gap-4 sm:grid-cols-3">
            <Card>
              <CardHeader>
                <CardDescription>إجمالي الطلاب المقيدين</CardDescription>
                <CardTitle className="text-3xl tabular-nums">1,840</CardTitle>
              </CardHeader>
              <CardContent>
                <span className="text-sm font-semibold text-brand-teal">
                  ▲ 8% this month
                </span>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardDescription>إجمالي الإيرادات (شهري)</CardDescription>
                <CardTitle className="text-3xl tabular-nums">
                  145,200 <span className="text-base font-normal">ج.م</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <span className="text-sm font-semibold text-brand-teal">
                  ▲ 14.2%
                </span>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardDescription>نسبة إشغال القاعات</CardDescription>
                <CardTitle className="text-3xl tabular-nums">82%</CardTitle>
              </CardHeader>
              <CardContent>
                <Separator className="mb-3" />
                <span className="text-sm font-semibold text-destructive">
                  ▼ 2%
                </span>
              </CardContent>
            </Card>
          </div>
        </Section>
      </div>
    </div>
  );
}
