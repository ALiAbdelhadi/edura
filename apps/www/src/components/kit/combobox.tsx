// Migration shim — this component now lives in @repo/ui.
// Kept as a re-export so no call site changes (design/DECISIONS.md D-01).
// New code should import from "@repo/ui/components/combobox" directly.
export * from "@repo/ui/components/combobox";
