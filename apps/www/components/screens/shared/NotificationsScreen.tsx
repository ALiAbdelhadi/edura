"use client";

import React from "react";
import { useList, useCustomMutation } from "@refinedev/core";
import { useRouter, useParams } from "next/navigation";
import { Card, Button, Space, Tag } from "antd";
import { BellOutlined, CheckOutlined } from "@ant-design/icons";
import { useI18n } from "@/components/providers/I18nProvider";

interface Notification {
  _id: string;
  type: string;
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
}

const TYPE_COLOR: Record<string, string> = {
  absence_marked: "blue",
  session_cancelled: "orange",
  payment_recorded: "green",
  enrollment_request_approved: "purple",
  grade_posted: "geekblue",
  default: "default",
};

function timeAgo(
  dateStr: string,
  t: (key: string) => string,
  formatNumber: (n: number | null | undefined) => string,
): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return t("shared.timeJustNow");
  if (m < 60) return t("shared.timeMinutesAgo").replace("{n}", formatNumber(m));
  const h = Math.floor(m / 60);
  if (h < 24) return t("shared.timeHoursAgo").replace("{n}", formatNumber(h));
  return t("shared.timeDaysAgo").replace("{n}", formatNumber(Math.floor(h / 24)));
}

export function NotificationsScreen() {
  const { t, formatNumber } = useI18n();
  const router = useRouter();
  const params = useParams();
  const role = params?.role as string || "student";
  const basePath = `/dashboard/${role === "center_admin" ? "admin" : role}`;

  const { query, result } = useList<Notification>({
    resource: "notifications",
    pagination: { mode: "off" },
  });
  const notifications = (result?.data ?? []) as Notification[];

  const { mutateAsync: markReadMut } = useCustomMutation();
  const { mutateAsync: markAllReadMut } = useCustomMutation();

  const getNotificationLink = (n: Notification): string | null => {
    const d = (n as any).data || {};
    switch (n.type) {
      case "payment_recorded":
        return `${basePath}/fees`;
      case "enrollment_request_approved":
      case "enrollment_request_declined":
        return `${basePath}/courses`;
      case "material_uploaded":
        return `${basePath}/materials`;
      case "session_cancelled":
      case "session_postponed":
        return `${basePath}/schedule`;
      case "grade_posted":
      case "grade_entered":
        return `${basePath}/grades`;
      case "absence_marked":
      case "attendance_corrected":
        return `${basePath}/attendance`;
      default:
        return null;
    }
  };

  const markRead = async (id: string) => {
    try {
      await markReadMut({ url: `notifications/${id}/read`, method: "post", values: {} });
      query.refetch();
    } catch { /* non-critical */ }
  };

  const handleNotificationClick = async (n: Notification) => {
    if (!n.read) await markRead(n._id);
    const link = getNotificationLink(n);
    if (link) router.push(link);
  };

  const markAllRead = async () => {
    try {
      await markAllReadMut({ url: "notifications/read-all", method: "post", values: {} });
      query.refetch();
    } catch { /* non-critical */ }
  };

  if (query.isLoading && notifications.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: 40, color: "#888" }}>
        {t("common.loading")}
      </div>
    );
  }

  const unread = notifications.filter((n) => !n.read).length;

  if (notifications.length === 0) {
    return (
      <Card style={{ textAlign: "center", padding: 40 }}>
        <BellOutlined style={{ fontSize: 32, color: "#ccc" }} />
        <p style={{ marginTop: 12, color: "#999" }}>{t("shared.notifEmpty")}</p>
      </Card>
    );
  }

  return (
    <Space direction="vertical" size="middle" style={{ width: "100%", maxWidth: 640 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>
          {t("nav.notifications")}
          {unread > 0 ? ` \u00b7 ${t("shared.notifUnreadCount").replace("{n}", formatNumber(unread))}` : ""}
        </h3>
        {unread > 0 && (
          <Button size="small" icon={<CheckOutlined />} onClick={markAllRead}>
            {t("shared.notifMarkAllRead")}
          </Button>
        )}
      </div>

      {notifications.map((n) => {
        const tagColor = TYPE_COLOR[n.type] ?? TYPE_COLOR.default;
        const typeKey = `shared.notifType_${n.type}`;
        const typeLabel = t(typeKey);
        const typeText = typeLabel === typeKey ? n.type.replace(/_/g, " ") : typeLabel;
        return (
          <Card
            key={n._id}
            size="small"
            hoverable
            onClick={() => handleNotificationClick(n)}
            style={{
              opacity: n.read ? 0.65 : 1,
              cursor: "pointer",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <span style={{ fontWeight: n.read ? 400 : 600, fontSize: 14 }}>{n.title}</span>
                  {!n.read && (
                    <div
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        background: "#0fa5e9",
                        flexShrink: 0,
                      }}
                    />
                  )}
                </div>
                <p style={{ fontSize: 13, color: "#666", margin: 0 }}>{n.body}</p>
              </div>
              <div style={{ flexShrink: 0, textAlign: "right" }}>
                <Tag color={tagColor} style={{ margin: 0 }}>
                  {typeText}
                </Tag>
                <div style={{ fontSize: 11, color: "#999", marginTop: 4 }}>
                  {timeAgo(n.createdAt, t, formatNumber)}
                </div>
              </div>
            </div>
          </Card>
        );
      })}
    </Space>
  );
}
