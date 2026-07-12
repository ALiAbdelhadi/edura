"use client";

import React from "react";
import * as d3 from "d3";

export type BarSeries = {
  key: string;
  label: string;
  color: string;
};

export type BarDatum = {
  label: string;
  [key: string]: string | number;
};

type BarChartProps = {
  data: BarDatum[];
  series: BarSeries[];
  height?: number;
  horizontal?: boolean;
  stacked?: boolean;
  yValueFormatter?: (value: number) => string;
  emptyText?: string;
};

export function BarChart({
  data,
  series,
  height = 280,
  horizontal = false,
  stacked = false,
  yValueFormatter,
  emptyText = "No chart data available.",
}: BarChartProps) {
  const svgRef = React.useRef<SVGSVGElement | null>(null);

  React.useEffect(() => {
    if (!svgRef.current || data.length === 0 || series.length === 0) return;
    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const width = 800;
    const margin = { top: 20, right: 24, bottom: 52, left: horizontal ? 160 : 56 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;
    const axisColor = "#a5a8b5";
    const gridColor = "#e0e2e8";

    if (horizontal && series.length === 1) {
      const key = series[0].key;
      const maxValue = d3.max(data, (row: BarDatum) => Number(row[key] ?? 0)) ?? 0;
      const xScale = d3
        .scaleLinear()
        .domain([0, Math.max(maxValue, 1)])
        .nice()
        .range([margin.left, margin.left + innerWidth]);
      const yScale = d3
        .scaleBand<string>()
        .domain(data.map((row) => row.label))
        .range([margin.top, margin.top + innerHeight])
        .padding(0.25);

      svg
        .append("g")
        .attr("transform", `translate(0, ${margin.top + innerHeight})`)
        .call(
          d3
            .axisBottom(xScale)
            .ticks(5)
            .tickFormat((v: d3.NumberValue) => (yValueFormatter ? yValueFormatter(Number(v)) : String(v))),
        )
        .call((g: any) => g.selectAll("text").attr("font-size", "11px").attr("fill", axisColor))
        .call((g: any) => g.selectAll("line,path").attr("stroke", gridColor));

      svg
        .append("g")
        .attr("transform", `translate(${margin.left}, 0)`)
        .call(d3.axisLeft(yScale).tickSizeOuter(0))
        .call((g: any) => g.selectAll("text").attr("font-size", "11px").attr("fill", axisColor))
        .call((g: any) => g.selectAll("line,path").attr("stroke", gridColor));

      svg
        .append("g")
        .selectAll("rect")
        .data(data)
        .join("rect")
        .attr("x", margin.left)
        .attr("y", (row: BarDatum) => yScale(row.label) ?? 0)
        .attr("height", yScale.bandwidth())
        .attr("width", (row: BarDatum) => Math.max(0, (xScale(Number(row[key] ?? 0)) ?? margin.left) - margin.left))
        .attr("fill", series[0].color)
        .attr("rx", 6);
      return;
    }

    const x0 = d3
      .scaleBand<string>()
      .domain(data.map((row) => row.label))
      .range([margin.left, margin.left + innerWidth])
      .padding(0.2);

    const x1 = d3
      .scaleBand<string>()
      .domain(series.map((entry) => entry.key))
      .range([0, x0.bandwidth()])
      .padding(0.1);

    const yMax = stacked
      ? d3.max(data, (row: BarDatum) =>
          series.reduce((sum: number, entry: BarSeries) => sum + Number(row[entry.key] ?? 0), 0),
        ) ?? 0
      : d3.max(data, (row: BarDatum) => d3.max(series, (entry: BarSeries) => Number(row[entry.key] ?? 0)) ?? 0) ?? 0;

    const yScale = d3
      .scaleLinear()
      .domain([0, Math.max(yMax, 1)])
      .nice()
      .range([margin.top + innerHeight, margin.top]);

    svg
      .append("g")
      .attr("transform", `translate(0, ${margin.top + innerHeight})`)
      .call(d3.axisBottom(x0).tickSizeOuter(0))
      .call((g: any) => g.selectAll("text").attr("font-size", "11px").attr("fill", axisColor))
      .call((g: any) => g.selectAll("line,path").attr("stroke", gridColor));

    svg
      .append("g")
      .attr("transform", `translate(${margin.left}, 0)`)
      .call(
        d3
          .axisLeft(yScale)
          .ticks(5)
          .tickFormat((v: d3.NumberValue) => (yValueFormatter ? yValueFormatter(Number(v)) : String(v))),
      )
      .call((g: any) => g.selectAll("text").attr("font-size", "11px").attr("fill", axisColor))
      .call((g: any) => g.selectAll("line,path").attr("stroke", gridColor))
      .call((g: any) =>
        g
          .selectAll(".tick line")
          .clone()
          .attr("x2", innerWidth)
          .attr("stroke-opacity", 0.5),
      );

    if (stacked) {
      const stack = d3
        .stack<BarDatum>()
        .keys(series.map((entry) => entry.key))
        .value((row: BarDatum, key: string) => Number(row[key] ?? 0));
      const stackedData = stack(data);
      svg
        .append("g")
        .selectAll("g")
        .data(stackedData)
        .join("g")
        .attr("fill", (_: unknown, index: number) => series[index]?.color ?? "#0fa5e9")
        .selectAll("rect")
        .data((rows: any) => rows)
        .join("rect")
        .attr("x", (row: any) => x0(row.data.label) ?? 0)
        .attr("y", (row: any) => yScale(row[1]))
        .attr("height", (row: any) => Math.max(0, yScale(row[0]) - yScale(row[1])))
        .attr("width", x0.bandwidth())
        .attr("rx", 4);
    } else {
      svg
        .append("g")
        .selectAll("g")
        .data(data)
        .join("g")
        .attr("transform", (row: BarDatum) => `translate(${x0(row.label) ?? 0},0)`)
        .selectAll("rect")
        .data((row: BarDatum) =>
          series.map((entry) => ({
            key: entry.key,
            value: Number(row[entry.key] ?? 0),
            color: entry.color,
          })),
        )
        .join("rect")
        .attr("x", (entry: { key: string; value: number; color: string }) => x1(entry.key) ?? 0)
        .attr("y", (entry: { key: string; value: number; color: string }) => yScale(entry.value))
        .attr("width", x1.bandwidth())
        .attr("height", (entry: { key: string; value: number; color: string }) => Math.max(0, yScale(0) - yScale(entry.value)))
        .attr("fill", (entry: { key: string; value: number; color: string }) => entry.color)
        .attr("rx", 4);
    }
  }, [data, series, height, horizontal, stacked, yValueFormatter]);

  if (data.length === 0 || series.length === 0) {
    return <div style={{ textAlign: "center", color: "#a5a8b5", padding: 24 }}>{emptyText}</div>;
  }

  return (
    <div>
      <svg
        ref={svgRef}
        width="100%"
        height={height}
        viewBox={`0 0 800 ${height}`}
        role="img"
        aria-label="bar chart"
      />
      <div style={{ display: "flex", gap: 16, justifyContent: "center", flexWrap: "wrap" }}>
        {series.map((entry) => (
          <div
            key={entry.key}
            style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "#555a6a" }}
          >
            <span style={{ width: 10, height: 10, borderRadius: "50%", background: entry.color }} />
            <span>{entry.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
