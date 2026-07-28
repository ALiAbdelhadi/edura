/* Shim. The implementation now lives in `@repo/ui/lib/format` — <Num> renders these
   figures and must not be able to drift from the function that formats them.
   Kept as a re-export so the 65 files importing `@/lib/i18n/format` are untouched. */
export {
  formatEGP,
  formatShortEGP,
  formatNumber,
  formatPercent,
  formatDate,
  formatWeekdayShort,
  pluralForm,
  formatProseCount,
  type PluralForms,
} from "@repo/ui/lib/format";
