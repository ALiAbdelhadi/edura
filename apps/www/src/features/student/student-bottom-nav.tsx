"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Award,
  BookOpen,
  Calendar,
  Bell,
  CheckCircle2,
  Home,
  MessageSquare,
  MoreHorizontal,
  Settings,
  Star,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@repo/ui/components/sheet";

type Dest = { href: string; icon: LucideIcon; labelKey: string };

/**
 * Phone chrome for the student portal.
 *
 * The brief is explicit: bottom navigation, not a collapsed sidebar. A
 * teenager on a 390px screen reaches the bottom of the viewport with a thumb;
 * a hamburger in the top corner is the furthest point from it.
 *
 * Four primary destinations plus "more", which opens the remainder in a sheet.
 * The four are chosen by what a student actually opens between classes — where
 * am I meant to be, what do I owe — not by nav-tree order.
 *
 * Lives here rather than in DashboardShell because that shell is shared with
 * parent, teacher, admin and assistant, and is not this session's to change.
 * When the foundation lands the shared bottom-nav primitive (its Part C), this
 * is replaced by it.
 */
const PRIMARY: Dest[] = [
  { href: "/dashboard/student", icon: Home, labelKey: "nav.dashboard" },
  { href: "/dashboard/student/schedule", icon: Calendar, labelKey: "nav.schedule" },
  { href: "/dashboard/student/subjects", icon: BookOpen, labelKey: "nav.subjects" },
  { href: "/dashboard/student/wallet", icon: Wallet, labelKey: "nav.wallet" },
];

const SECONDARY: Dest[] = [
  { href: "/dashboard/student/grades", icon: Award, labelKey: "nav.grades" },
  { href: "/dashboard/student/attendance", icon: CheckCircle2, labelKey: "nav.attendance" },
  { href: "/dashboard/student/materials", icon: BookOpen, labelKey: "nav.materials" },
  { href: "/dashboard/student/reviews", icon: Star, labelKey: "nav.reviews" },
  { href: "/dashboard/student/family", icon: Users, labelKey: "nav.family" },
  { href: "/dashboard/student/messages", icon: MessageSquare, labelKey: "nav.messages" },
  { href: "/dashboard/student/notifications", icon: Bell, labelKey: "nav.notifications" },
  { href: "/dashboard/student/settings", icon: Settings, labelKey: "nav.settings" },
];

export function StudentBottomNav() {
  const t = useTranslations();
  const pathname = usePathname() ?? "";
  const [moreOpen, setMoreOpen] = useState(false);

  // Strip the locale segment so matching works in both ar and en.
  const path = pathname.replace(/^\/(ar|en)(?=\/|$)/, "") || "/";
  const isActive = (href: string) =>
    href === "/dashboard/student" ? path === href : path === href || path.startsWith(href + "/");

  const label = (key: string) => t(key as Parameters<typeof t>[0]);

  return (
    <nav
      aria-label={t("studentNav.navigation")}
      className="fixed inset-x-0 bottom-0 z-40 md:hidden"
      style={{
        background: "var(--sheet)",
        borderTop: "1px solid var(--rule)",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      <ul className="flex items-stretch">
        {PRIMARY.map((d) => {
          const active = isActive(d.href);
          const Icon = d.icon;
          return (
            <li key={d.href} className="flex-1">
              <Link
                href={d.href}
                aria-current={active ? "page" : undefined}
                className="relative flex flex-col items-center gap-1 py-2.5"
                style={{ color: active ? "var(--indigo)" : "var(--ink-2)" }}
              >
                {/* Active state is the indigo bar rotated above the item —
                    the same device as the sidebar's inset rule. */}
                {active ? (
                  <span
                    aria-hidden
                    className="absolute inset-x-4 top-0 h-0.5 rounded-full"
                    style={{ background: "var(--indigo)" }}
                  />
                ) : null}
                <Icon className="size-5" aria-hidden />
                <span className="text-[11px] font-medium leading-none">{label(d.labelKey)}</span>
              </Link>
            </li>
          );
        })}

        <li className="flex-1">
          <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
            <SheetTrigger asChild>
              <button
                type="button"
                className="flex w-full flex-col items-center gap-1 py-2.5"
                style={{ color: "var(--ink-2)" }}
              >
                <MoreHorizontal className="size-5" aria-hidden />
                <span className="text-[11px] font-medium leading-none">
                  {t("studentNav.more")}
                </span>
              </button>
            </SheetTrigger>
            <SheetContent side="bottom" style={{ background: "var(--sheet)" }}>
              <SheetHeader>
                <SheetTitle style={{ color: "var(--ink)" }}>
                  {t("studentNav.navigation")}
                </SheetTitle>
              </SheetHeader>
              <ul className="grid grid-cols-3 gap-2 p-4">
                {SECONDARY.map((d) => {
                  const Icon = d.icon;
                  const active = isActive(d.href);
                  return (
                    <li key={d.href}>
                      <Link
                        href={d.href}
                        onClick={() => setMoreOpen(false)}
                        aria-current={active ? "page" : undefined}
                        className="flex flex-col items-center gap-2 rounded-lg p-3 text-center"
                        style={{
                          background: active ? "var(--indigo-soft)" : "var(--field)",
                          color: active ? "var(--indigo)" : "var(--ink-2)",
                          border: "1px solid var(--rule)",
                        }}
                      >
                        <Icon className="size-5" aria-hidden />
                        <span className="text-xs font-medium leading-tight">
                          {label(d.labelKey)}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </SheetContent>
          </Sheet>
        </li>
      </ul>
    </nav>
  );
}
