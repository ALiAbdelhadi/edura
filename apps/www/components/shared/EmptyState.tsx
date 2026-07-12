"use client";

import React from "react";
import { Button, Empty, Typography, theme } from "antd";

const { Text, Title } = Typography;

/**
 * Shared empty state (PRD §0 non-negotiable #7: every empty list needs a clear
 * CTA). Two flavors via `variant`: 'first-run' (teach one action) and
 * 'no-results' (offer to reset filters). Icon-only visuals are decorative
 * (aria-hidden); the heading carries the meaning for screen readers.
 */
export function EmptyState({
  title,
  description,
  actionLabel,
  onAction,
  icon,
  variant = "first-run",
}: {
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  icon?: React.ReactNode;
  variant?: "first-run" | "no-results";
}) {
  const { token } = theme.useToken();
  return (
    <div
      role="status"
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        padding: "48px 24px",
        gap: 8,
      }}
    >
      <div aria-hidden style={{ color: token.colorTextQuaternary, marginBottom: 4 }}>
        {icon ?? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={false} />}
      </div>
      <Title level={5} style={{ margin: 0 }}>
        {title}
      </Title>
      {description && (
        <Text type="secondary" style={{ maxWidth: 420 }}>
          {description}
        </Text>
      )}
      {actionLabel && onAction && (
        <Button
          type={variant === "first-run" ? "primary" : "default"}
          onClick={onAction}
          style={{ marginTop: 12 }}
        >
          {actionLabel}
        </Button>
      )}
    </div>
  );
}
