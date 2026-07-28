// Migration shim — this component now lives in @repo/ui.
// Kept as a re-export so no call site changes (design/DECISIONS.md D-01).
// New code should import from "@repo/ui/components/metric-card" directly.
export { MetricCard, StatCard } from "@repo/ui/components/metric-card";
export type { MetricCardProps } from "@repo/ui/components/metric-card";
