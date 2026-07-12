"use client";

import React from "react";
import { Space } from "antd";
import { AttendanceScreen } from "@/components/screens/shared/AttendanceScreen";
import { useChildSelector, ChildSelectorBar } from "@/components/shared/ChildSelector";

export default function Page() {
  const { childId } = useChildSelector();

  if (!childId) {
    return <div style={{ textAlign: "center", padding: 40, color: "#888" }}>No linked children.</div>;
  }

  return (
    <Space direction="vertical" size="middle" style={{ width: "100%" }}>
      <ChildSelectorBar />
      <AttendanceScreen studentId={childId} />
    </Space>
  );
}
