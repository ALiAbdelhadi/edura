/* Moved to @repo/ui — see that file for the reasoning.
   This shim keeps every existing `@/components/providers/theme-mode-provider`
   import in this app working unchanged. */
"use client";

export {
  ThemeModeProvider,
  useThemeMode,
  type ThemeMode,
} from "@repo/ui/components/theme-mode-provider";
