/* MIGRATION SHIM — see the note in @repo/ui/components/metric-card.
   `StatCard` keeps its old API (filled / trend / trendValue / unit / accent) because 25
   call sites still pass those props, and a promotion that forces a call site to change
   is a promotion done wrong. Each portal session replaces its own StatCards with
   <MetricCard> as it converts; when the count reaches zero this file is deleted. */
export { StatCard } from "@repo/ui/components/stat-card-legacy";
export { MetricCard } from "@repo/ui/components/metric-card";
