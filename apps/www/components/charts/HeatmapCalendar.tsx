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

    const color = d3
      .scaleLinear<string>()
      .domain([0, 50, 100])
      .range(["#ffe7cd", "#e0f2fe", "#dcfce7"]);

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
      .attr("stroke", "#e0e2e8");

    node
      .append("text")
      .attr("x", 8)
      .attr("y", cellHeight / 2 + 4)
      .attr("font-size", "11px")
      .attr("fill", "#555a6a")
      .text((entry: HeatmapCell) => entry.label);
  }, [cells, columns, height]);

  if (cells.length === 0) {
    return <div style={{ textAlign: "center", color: "#a5a8b5", padding: 24 }}>{emptyText}</div>;
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
