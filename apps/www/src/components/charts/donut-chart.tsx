"use client";

import React from "react";
import * as d3 from "d3";

export type DonutSlice = {
  id: string;
  label: string;
  value: number;
  color: string;
};

type DonutChartProps = {
  data: DonutSlice[];
  height?: number;
  innerRadiusRatio?: number;
  centerLabel?: string;
  emptyText?: string;
  /** Formats the center total and legend values. Defaults to a plain grouped number — pass a currency formatter when `value` is money. */
  formatValue?: (value: number) => string;
};

export function DonutChart({
  data,
  height = 260,
  innerRadiusRatio = 0.62,
  centerLabel,
  emptyText = "No chart data available.",
  formatValue = (value: number) => value.toLocaleString(),
}: DonutChartProps) {
  const svgRef = React.useRef<SVGSVGElement | null>(null);
  const total = data.reduce((sum, slice) => sum + slice.value, 0);

  React.useEffect(() => {
    if (!svgRef.current || total <= 0) return;
    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const width = 800;
    const radius = Math.min(width, height) * 0.32;
    const centerX = width / 2;
    const centerY = height / 2;
    const innerRadius = radius * innerRadiusRatio;

    const pie = d3
      .pie<DonutSlice>()
      .value((slice: DonutSlice) => slice.value)
      .sort(null)(data);
    const arc = d3.arc<d3.PieArcDatum<DonutSlice>>().innerRadius(innerRadius).outerRadius(radius);

    const group = svg
      .append("g")
      .attr("transform", `translate(${centerX},${centerY})`);

    group
      .selectAll("path")
      .data(pie)
      .join("path")
      .attr("d", arc)
      .attr("fill", (slice: d3.PieArcDatum<DonutSlice>) => slice.data.color)
      .attr("stroke", "var(--card)")
      .attr("stroke-width", 2);

    group
      .append("text")
      .attr("text-anchor", "middle")
      .attr("dy", "-0.2em")
      .attr("font-size", "30px")
      .attr("font-weight", 700)
      .attr("fill", "var(--foreground)")
      .text(formatValue(total));

    if (centerLabel) {
      group
        .append("text")
        .attr("text-anchor", "middle")
        .attr("dy", "1.4em")
        .attr("font-size", "12px")
        .attr("fill", "var(--muted-foreground)")
        .text(centerLabel);
    }
  }, [data, total, height, innerRadiusRatio, centerLabel, formatValue]);

  if (total <= 0) {
    return <div style={{ textAlign: "center", color: "var(--muted-foreground)", padding: 24 }}>{emptyText}</div>;
  }

  return (
    <div>
      <svg
        ref={svgRef}
        width="100%"
        height={height}
        viewBox={`0 0 800 ${height}`}
        role="img"
        aria-label="donut chart"
      />
      <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
        {data.map((slice) => (
          <div
            key={slice.id}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8,
              fontSize: 12,
            }}
          >
            <span style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--muted-foreground)" }}>
              <span style={{ width: 10, height: 10, borderRadius: "50%", background: slice.color }} />
              {slice.label}
            </span>
            <span style={{ fontWeight: 600, color: "var(--foreground)" }}>{formatValue(slice.value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
