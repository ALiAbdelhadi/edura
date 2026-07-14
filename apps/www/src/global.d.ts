import type { routing } from "@/i18n/routing";
import type { Messages } from "@/lib/i18n";

/**
 * next-intl TypeScript augmentation (Phase 7).
 *
 * Makes translation keys strongly typed: `t("nav.teachers")` autocompletes and
 * an invalid/misspelled key fails `tsc`. `Locale` is constrained to the
 * configured locales.
 */
declare module "next-intl" {
  interface AppConfig {
    Locale: (typeof routing.locales)[number];
    Messages: Messages;
  }
}
