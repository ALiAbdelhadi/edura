"use client";

import React from "react";
import * as d3 from "d3";

export type HeatmapCell = {
  date: string;
  value: number;
  label: string;
};

type HeatmapCalendarProps = {
  cells: HeatmapCell[];
  columns?: number;
  height?: number;
  emptyText?: string;
};

export function HeatmapCalendar({
  cells,
  columns = 7,
  height = 220,
  emptyText = "No chart data available.",
}: HeatmapCalendarProps) {
  const svgRef = React.useRef<SVGSVGElement | null>(null);

  React.useEffect(() => {
    if (!svgRef.current || cells.length === 0) return;
    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const width = 800;
    const margin = { top: 16, right: 24, bottom: 24, left: 24 };
    const innerWidth = width - margin.left - margin.right;
    const rows = Math.ceil(cells.length / columns);
    const gap = 8;
    const cellWidth = (innerWidth - gap * (columns - 1)) / columns;
    const cellHeight = Math.max(26, (height - margin.top - margin.bottom - gap * (rows - 1)) / rows);

    // d3's scaleLinear interpolates its range colours in JS, so it can't parse
    // raw `var(--…)` strings — resolve the design tokens to concrete values first.
    const styles = getComputedStyle(svgRef.current);
    const token = (name: string) => styles.getPropertyValue(name).trim();
    const color = d3
      .scaleLinear<string>()
      .domain([0, 50, 100])
      .range([token("--chart-4"), token("--chart-3"), token("--chart-2")]);

    const root = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);
    const node = root
      .selectAll("g.cell")
      .data(cells)
      .join("g")
      .attr("class", "cell")
      .attr("transform", (_: HeatmapCell, index: number) => {
        const col = index % columns;
        const row = Math.floor(index / columns);
        return `translate(${col * (cellWidth + gap)},${row * (cellHeight + gap)})`;
      });

    node
      .append("rect")
      .attr("width", cellWidth)
      .attr("height", cellHeight)
      .attr("rx", 6)
      .attr("fill", (entry: HeatmapCell) => color(entry.value))
      .attr("stroke", "var(--border)");

    node
      .append("text")
      .attr("x", 8)
      .attr("y", cellHeight / 2 + 4)
      .attr("font-size", "11px")
      .attr("fill", "var(--muted-foreground)")
      .text((entry: HeatmapCell) => entry.label);
  }, [cells, columns, height]);

  if (cells.length === 0) {
    return <div style={{ textAlign: "center", color: "var(--muted-foreground)", padding: 24 }}>{emptyText}</div>;
  }

  return (
    <svg
      ref={svgRef}
      width="100%"
      height={height}
      viewBox={`0 0 800 ${height}`}
      role="img"
      aria-label="calendar heatmap"
    />
  );
}
