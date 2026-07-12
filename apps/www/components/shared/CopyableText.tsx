"use client";

import React from "react";
import { message, Tooltip } from "antd";
import { CopyOutlined } from "@ant-design/icons";
import { useI18n } from "@/components/providers/I18nProvider";

type CopyableTextProps = {
  value?: string | number | null;
  label?: string;
  emptyText?: string;
  monospace?: boolean;
};

export default function CopyableText({
  value,
  label,
  emptyText,
  monospace = true,
}: CopyableTextProps) {
  const { t } = useI18n();
  const text = value === undefined || value === null || value === "" ? "" : String(value);
  const emptyLabel = emptyText ?? t("shared.copyNa");

  const handleCopy = async (event: React.MouseEvent<HTMLSpanElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (!text) return;

    try {
      await navigator.clipboard.writeText(text);
      message.success(t("shared.copyCopied").replace("{label}", label || t("shared.copyValue")));
    } catch {
      message.error(t("shared.copyFailed"));
    }
  };

  if (!text) return <span style={{ color: "#999" }}>{emptyLabel}</span>;

  return (
    <Tooltip title={t("shared.copyTooltip").replace("{label}", label ? label.toLowerCase() : t("shared.copyValue").toLowerCase())}>
      <span
        role="button"
        tabIndex={0}
        onClick={handleCopy}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            handleCopy(event as unknown as React.MouseEvent<HTMLSpanElement>);
          }
        }}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          maxWidth: "100%",
          padding: "2px 6px",
          borderRadius: 6,
          background: "#f6f8fb",
          border: "1px solid #e6ebf2",
          color: "#334155",
          cursor: "copy",
          fontFamily: monospace ? "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" : undefined,
          fontSize: 12,
          lineHeight: 1.6,
        }}
      >
        <span
          style={{
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {text}
        </span>
        <CopyOutlined style={{ color: "#94a3b8", fontSize: 11, flexShrink: 0 }} />
      </span>
    </Tooltip>
  );
}
