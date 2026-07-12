"use client";

import React from "react";
import { Skeleton, Card, Row, Col, Space, theme } from "antd";

/**
 * Skeleton loaders (PRD §0 non-negotiable #6: skeleton loaders on all data
 * screens). Match real content dimensions so there's no layout shift when data
 * arrives. Use these instead of bare spinners.
 */

export function StatCardsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <Row gutter={[16, 16]}>
      {Array.from({ length: count }).map((_, i) => (
        <Col key={i} xs={12} sm={12} md={6}>
          <Card size="small" aria-hidden>
            <Skeleton active title={{ width: "40%" }} paragraph={{ rows: 1, width: ["70%"] }} />
          </Card>
        </Col>
      ))}
    </Row>
  );
}

export function TableSkeleton({ rows = 6, columns = 4 }: { rows?: number; columns?: number }) {
  const { token } = theme.useToken();
  return (
    <div role="status" aria-busy aria-label="Loading" style={{ width: "100%" }}>
      {/* header row */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${columns}, 1fr)`,
          gap: 16,
          padding: "12px 16px",
          background: token.colorFillTertiary,
          borderRadius: token.borderRadius,
          marginBottom: 8,
        }}
      >
        {Array.from({ length: columns }).map((_, c) => (
          <Skeleton.Button key={c} active size="small" block style={{ height: 14 }} />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div
          key={r}
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${columns}, 1fr)`,
            gap: 16,
            padding: "16px",
            borderBottom: `1px solid ${token.colorBorderSecondary}`,
          }}
        >
          {Array.from({ length: columns }).map((_, c) => (
            <Skeleton.Button key={c} active size="small" block style={{ height: 16 }} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <Space direction="vertical" size="middle" style={{ width: "100%" }} role="status" aria-busy>
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} active avatar paragraph={{ rows: 1 }} title={{ width: "30%" }} />
      ))}
    </Space>
  );
}

/** Full data-page skeleton: KPI row + table. */
export function PageSkeleton() {
  return (
    <Space direction="vertical" size="large" style={{ width: "100%" }}>
      <StatCardsSkeleton />
      <Card>
        <TableSkeleton />
      </Card>
    </Space>
  );
}
