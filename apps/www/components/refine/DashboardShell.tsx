"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useGetIdentity, useLogout, useList } from "@refinedev/core";
import {
  Layout,
  Menu,
  Avatar,
  Button,
  Typography,
  Space,
  Badge,
  theme,
} from "antd";
import {
  HomeOutlined,
  CalendarOutlined,
  FileTextOutlined,
  TrophyOutlined,
  CheckCircleOutlined,
  MessageOutlined,
  BookOutlined,
  TeamOutlined,
  UserOutlined,
  DollarOutlined,
  BellOutlined,
  SettingOutlined,
  LogoutOutlined,
  AppstoreOutlined,
  BarChartOutlined,
  FileSearchOutlined,
  StarOutlined,
  SearchOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
} from "@ant-design/icons";
import type { MeResponse } from "@/lib/refine";
import { useI18n } from "@/components/providers/I18nProvider";
import { ThemeToggle } from "@/components/shared/ThemeToggle";

// Maps the English nav/screen label a layout passes in → an i18n key.
const NAV_KEY: Record<string, string> = {
  Overview: "nav.overview",
  Registrations: "nav.registrations",
  Transactions: "nav.transactions",
  Payouts: "nav.payouts",
  Statements: "nav.statements",
  Alerts: "nav.alerts",
  Dashboard: "nav.dashboard",
  Students: "nav.students",
  Teachers: "nav.teachers",
  Classes: "nav.classes",
  Courses: "nav.courses",
  Grades: "nav.grades",
  Gradebook: "nav.gradebook",
  Fees: "nav.fees",
  Sessions: "nav.sessions",
  Schedule: "nav.schedule",
  Enrollments: "nav.enrollments",
  "Enrollment Requests": "nav.enrollmentRequests",
  Expenses: "nav.expenses",
  Rooms: "nav.rooms",
  Reports: "nav.reports",
  Children: "nav.children",
  Attendance: "nav.attendance",
  Messages: "nav.messages",
  Notifications: "nav.notifications",
  Settings: "nav.settings",
  Materials: "nav.materials",
  Reviews: "nav.reviews",
  Assignments: "nav.assignments",
  "Family Code": "nav.family",
  Progress: "nav.progress",
  Affiliations: "nav.affiliations",
  Centers: "nav.centers",
  Browse: "nav.browse",
};

const { Sider, Header, Content } = Layout;
const { Text } = Typography;

const iconMap: Record<string, React.ReactNode> = {
  home: <HomeOutlined />,
  calendar: <CalendarOutlined />,
  clipboard: <FileTextOutlined />,
  award: <TrophyOutlined />,
  check: <CheckCircleOutlined />,
  message: <MessageOutlined />,
  book: <BookOutlined />,
  users: <TeamOutlined />,
  person: <UserOutlined />,
  dollar: <DollarOutlined />,
  bell: <BellOutlined />,
  settings: <SettingOutlined />,
  grid: <AppstoreOutlined />,
  chart: <BarChartOutlined />,
  report: <FileSearchOutlined />,
  star: <StarOutlined />,
  search: <SearchOutlined />,
};

type NavItem = {
  href: string;
  icon: string;
  label: string;
};

const roleLabels: Record<string, { name: string; color: string }> = {
  student: { name: "Student", color: "#5b76fe" },
  teacher: { name: "Teacher", color: "#187574" },
  parent: { name: "Parent", color: "#6b0050" },
  admin: { name: "Admin", color: "#7a3b00" },
  superadmin: { name: "Super Admin", color: "#0284c7" },
  finance: { name: "Accountant", color: "#047857" },
};

function getInitials(name: string) {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export default function DashboardShell({
  role,
  navItems,
  children,
}: {
  role: string;
  navItems: NavItem[];
  children: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();
  const { t } = useI18n();
  const tNav = (label: string) => (NAV_KEY[label] ? t(NAV_KEY[label]) : label);
  const { data: identity } = useGetIdentity<MeResponse>();
  const { mutate: logout } = useLogout();
  const { token } = theme.useToken();

  const { result: unreadResult } = useList({
    resource: "notifications",
    filters: [{ field: "read", operator: "eq" as const, value: false }],
    pagination: { pageSize: 1, currentPage: 1 },
  });
  const unreadCount = (unreadResult?.total ?? 0) as number;

  const roleInfo = roleLabels[role] || { name: "User", color: "#0fa5e9" };
  const displayName = identity?.name || roleInfo.name;

  // Strip the /<locale> prefix so nav hrefs (which omit it) match the pathname.
  const path = (pathname ?? "").replace(/^\/(ar|en)(?=\/|$)/, "") || "/";
  const selectedKey =
    navItems.find((item) => path === item.href)?.href ||
    // Longest matching prefix wins so deep routes select the right parent.
    [...navItems]
      .filter((item) => path === item.href || path.startsWith(item.href + "/"))
      .sort((a, b) => b.href.length - a.href.length)[0]?.href ||
    navItems[0]?.href;

  const screenLabel =
    navItems.find((item) => item.href === selectedKey)?.label || "Dashboard";

  return (
    <Layout style={{ minHeight: "100vh" }}>
      <Sider
        trigger={null}
        collapsible
        collapsed={collapsed}
        breakpoint="lg"
        onBreakpoint={(broken) => setCollapsed(broken)}
        style={{
          background: token.colorBgContainer,
          borderRight: `1px solid ${token.colorBorderSecondary}`,
        }}
      >
        <div
          style={{
            height: 64,
            display: "flex",
            alignItems: "center",
            justifyContent: collapsed ? "center" : "flex-start",
            padding: collapsed ? 0 : "0 16px",
            borderBottom: `1px solid ${token.colorBorderSecondary}`,
          }}
        >
          <img
            src="/edura-mark.svg"
            alt="Edura"
            style={{ height: 56, width: 56 }}
          />
          {!collapsed && (
            <Text
              strong
              style={{ marginLeft: 8, fontSize: 16, color: token.colorText }}
            >
              Edura
            </Text>
          )}
        </div>

        <div
          style={{
            padding: "16px",
            borderBottom: `1px solid ${token.colorBorderSecondary}`,
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          <Avatar
            style={{
              backgroundColor: roleInfo.color + "20",
              color: roleInfo.color,
              fontWeight: 700,
            }}
            size="default"
          >
            {getInitials(displayName)}
          </Avatar>
          {!collapsed && (
            <div style={{ overflow: "hidden" }}>
              <Text strong style={{ display: "block", fontSize: 14 }}>
                {displayName}
              </Text>
              <Text type="secondary" style={{ fontSize: 12 }}>
                {t("roles." + role)}
              </Text>
            </div>
          )}
        </div>

        <Menu
          mode="inline"
          selectedKeys={[selectedKey]}
          style={{ borderRight: 0 }}
          items={navItems.map((item) => ({
            key: item.href,
            icon: iconMap[item.icon] || <AppstoreOutlined />,
            label: (
              <Link href={item.href}>
                {item.href.includes("notifications") && unreadCount > 0 ? (
                  <Badge count={unreadCount} size="small" offset={[8, 0]}>
                    <span>{tNav(item.label)}</span>
                  </Badge>
                ) : (
                  tNav(item.label)
                )}
              </Link>
            ),
          }))}
        />

        <div style={{ marginTop: "auto", padding: "8px 16px" }}>
          <Button
            type="text"
            danger
            icon={<LogoutOutlined />}
            onClick={() => logout()}
            block={!collapsed}
            style={{ justifyContent: collapsed ? "center" : "flex-start" }}
          >
            {!collapsed && t("actions.logout")}
          </Button>
        </div>
      </Sider>

      <Layout>
        <Header
          style={{
            background: token.colorBgContainer,
            borderBottom: `1px solid ${token.colorBorderSecondary}`,
            padding: "0 24px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <Space align="center">
            <Button
              type="text"
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              aria-expanded={!collapsed}
              icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
              onClick={() => setCollapsed((c) => !c)}
            />
            <Text strong style={{ fontSize: 18 }}>
              {tNav(screenLabel)}
            </Text>
          </Space>
          <Space align="center" size="middle">
            <ThemeToggle />
            <Badge count={unreadCount} size="small">
              <Link
                href={`/dashboard/${role === "center_admin" ? "admin" : role}/notifications`}
                aria-label={`${t("nav.notifications") === "nav.notifications" ? "Notifications" : t("nav.notifications")}${unreadCount > 0 ? ` (${unreadCount})` : ""}`}
              >
                <Button type="text" aria-label="Notifications" icon={<BellOutlined />} />
              </Link>
            </Badge>
            <Avatar
              style={{
                backgroundColor: roleInfo.color + "20",
                color: roleInfo.color,
                fontWeight: 700,
              }}
            >
              {getInitials(displayName)}
            </Avatar>
          </Space>
        </Header>

        <Content
          style={{
            margin: 24,
            padding: 24,
            background: token.colorBgContainer,
            borderRadius: token.borderRadiusLG,
            minHeight: 280,
            overflow: "auto",
          }}
        >
          {children}
        </Content>
      </Layout>
    </Layout>
  );
}
