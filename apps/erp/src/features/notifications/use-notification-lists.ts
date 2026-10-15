"use client";

import { useInvalidate, useList, type BaseRecord } from "@refinedev/core";
import React from "react";

type NotificationRow = BaseRecord & { read?: boolean };

const FULL_LIST = { resource: "notifications", pagination: { mode: "off" as const } };

export function useNotificationList<T extends BaseRecord = BaseRecord>() {
  return useList<T>(FULL_LIST);
}

export function useUnreadNotificationCount(onNotificationsPage: boolean): number {
  const badge = useList({
    resource: "notifications",
    filters: [{ field: "read", operator: "eq" as const, value: false }],
    pagination: { pageSize: 1, currentPage: 1 },
    queryOptions: { enabled: !onNotificationsPage },
  });
  const full = useList<NotificationRow>({
    ...FULL_LIST,
    queryOptions: { enabled: onNotificationsPage },
  });
  if (onNotificationsPage) {
    return (full.result?.data ?? []).filter((n) => !n.read).length;
  }
  return (badge.result?.total ?? 0) as number;
}

export function useInvalidateNotifications() {
  const invalidate = useInvalidate();
  return React.useCallback(
    () => invalidate({ resource: "notifications", invalidates: ["list"] }),
    [invalidate],
  );
}
