"use client";

import React from "react";
import * as d3 from "d3";

type ProgressArcChartProps = {
  percent: number;
  height?: number;
  color?: string;
  trackColor?: string;
  label?: string;
  subLabel?: string;
};

export function ProgressArcChart({
  percent,
  height = 220,
  color = "#0fa5e9",
  trackColor = "#e0e2e8",
  label,
  subLabel,
}: ProgressArcChartProps) {
  const svgRef = React.useRef<SVGSVGElement | null>(null);
  const boundedPercent = Math.max(0, Math.min(100, Math.round(percent)));

  React.useEffect(() => {
    if (!svgRef.current) return;
    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const width = 800;
    const centerX = width / 2;
    const centerY = height * 0.92;
    const radius = Math.min(width * 0.32, height * 0.75);
    const innerRadius = radius * 0.72;
    const startAngle = -Math.PI;
    const endAngle = 0;

    const group = svg
      .append("g")
      .attr("transform", `translate(${centerX},${centerY})`);

    const trackArc = d3
      .arc()
      .innerRadius(innerRadius)
      .outerRadius(radius)
      .startAngle(startAngle)
      .endAngle(endAngle);

    const valueArc = d3
      .arc()
      .innerRadius(innerRadius)
      .outerRadius(radius)
      .startAngle(startAngle)
      .endAngle(startAngle + ((endAngle - startAngle) * boundedPercent) / 100);

    group
      .append("path")
      .attr("d", trackArc as any)
      .attr("fill", trackColor);

    group
      .append("path")
      .attr("d", valueArc as any)
      .attr("fill", color);

    group
      .append("text")
      .attr("text-anchor", "middle")
      .attr("x", 0)
      .attr("y", -28)
      .attr("font-size", "40px")
      .attr("font-weight", 700)
      .attr("fill", "#1c1c1e")
      .text(`${boundedPercent}%`);

    if (label) {
      group
        .append("text")
        .attr("text-anchor", "middle")
        .attr("x", 0)
        .attr("y", 0)
        .attr("font-size", "14px")
        .attr("fill", "#555a6a")
        .text(label);
    }

    if (subLabel) {
      group
        .append("text")
        .attr("text-anchor", "middle")
        .attr("x", 0)
        .attr("y", 22)
        .attr("font-size", "12px")
        .attr("fill", "#a5a8b5")
        .text(subLabel);
    }
  }, [boundedPercent, height, color, trackColor, label, subLabel]);

  return (
    <svg
      ref={svgRef}
      width="100%"
      height={height}
      viewBox={`0 0 800 ${height}`}
      role="img"
      aria-label="progress arc chart"
    />
  );
}
