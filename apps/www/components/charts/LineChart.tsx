"use client";

import React from "react";
import * as d3 from "d3";

export type LineSeriesPoint = {
  x: string;
  value: number;
};

export type LineSeries = {
  id: string;
  label: string;
  color: string;
  points: LineSeriesPoint[];
};

type LineChartProps = {
  series: LineSeries[];
  height?: number;
  yTickCount?: number;
  showArea?: boolean;
  yValueFormatter?: (value: number) => string;
  emptyText?: string;
};

export function LineChart({
  series,
  height = 260,
  yTickCount = 5,
  showArea = false,
  yValueFormatter,
  emptyText = "No chart data available.",
}: LineChartProps) {
  const svgRef = React.useRef<SVGSVGElement | null>(null);
  const hasData = series.some((line) => line.points.length > 0);

  React.useEffect(() => {
    if (!svgRef.current || !hasData) return;
    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const width = 800;
    const margin = { top: 20, right: 24, bottom: 48, left: 56 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    const xLabels = Array.from(
      new Set(series.flatMap((line) => line.points.map((point) => point.x))),
    );
    const yMax =
      d3.max(series, (line: LineSeries) => d3.max(line.points, (point: LineSeriesPoint) => point.value) ?? 0) ??
      0;
    const yCeil = Math.max(yMax, 1);

    const xScale = d3
      .scalePoint<string>()
      .domain(xLabels)
      .range([margin.left, margin.left + innerWidth])
      .padding(0.5);
    const yScale = d3
      .scaleLinear()
      .domain([0, yCeil])
      .nice()
      .range([margin.top + innerHeight, margin.top]);

    const axisColor = "#a5a8b5";
    const gridColor = "#e0e2e8";

    svg
      .append("g")
      .attr("transform", `translate(0, ${margin.top + innerHeight})`)
      .call(d3.axisBottom(xScale).tickSizeOuter(0))
      .call((g: any) =>
        g.selectAll("text").attr("font-size", "11px").attr("fill", axisColor),
      )
      .call((g: any) => g.selectAll("line,path").attr("stroke", gridColor));

    svg
      .append("g")
      .attr("transform", `translate(${margin.left}, 0)`)
      .call(
        d3
          .axisLeft(yScale)
          .ticks(yTickCount)
          .tickFormat((v: d3.NumberValue) => (yValueFormatter ? yValueFormatter(Number(v)) : String(v))),
      )
      .call((g: any) =>
        g.selectAll("text").attr("font-size", "11px").attr("fill", axisColor),
      )
      .call((g: any) => g.selectAll("line,path").attr("stroke", gridColor))
      .call((g: any) =>
        g
          .selectAll(".tick line")
          .clone()
          .attr("x2", innerWidth)
          .attr("stroke-opacity", 0.5),
      );

    const lineBuilder = d3
      .line<LineSeriesPoint>()
      .x((point) => xScale(point.x) ?? 0)
      .y((point) => yScale(point.value))
      .curve(d3.curveMonotoneX);

    const areaBuilder = d3
      .area<LineSeriesPoint>()
      .x((point) => xScale(point.x) ?? 0)
      .y0(yScale(0))
      .y1((point) => yScale(point.value))
      .curve(d3.curveMonotoneX);

    for (const line of series) {
      if (showArea) {
        svg
          .append("path")
          .datum(line.points)
          .attr("fill", line.color)
          .attr("fill-opacity", 0.12)
          .attr("d", areaBuilder);
      }

      svg
        .append("path")
        .datum(line.points)
        .attr("fill", "none")
        .attr("stroke", line.color)
        .attr("stroke-width", 2.5)
        .attr("stroke-linecap", "round")
        .attr("stroke-linejoin", "round")
        .attr("d", lineBuilder);

      svg
        .append("g")
        .selectAll("circle")
        .data(line.points)
        .join("circle")
        .attr("cx", (point: LineSeriesPoint) => xScale(point.x) ?? 0)
        .attr("cy", (point: LineSeriesPoint) => yScale(point.value))
        .attr("r", 3)
        .attr("fill", "#fff")
        .attr("stroke", line.color)
        .attr("stroke-width", 2);
    }
  }, [series, height, yTickCount, showArea, hasData, yValueFormatter]);

  if (!hasData) {
    return (
      <div style={{ textAlign: "center", color: "#a5a8b5", padding: 24 }}>
        {emptyText}
      </div>
    );
  }

  return (
    <div>
      <svg
        ref={svgRef}
        width="100%"
        height={height}
        viewBox={`0 0 800 ${height}`}
        role="img"
        aria-label="line chart"
      />
      <div style={{ display: "flex", gap: 16, justifyContent: "center", flexWrap: "wrap" }}>
        {series.map((line) => (
          <div
            key={line.id}
            style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "#555a6a" }}
          >
            <span style={{ width: 10, height: 10, borderRadius: "50%", background: line.color }} />
            <span>{line.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
