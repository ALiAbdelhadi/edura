import type { routing } from "@/i18n/routing";
import type { Messages } from "@/lib/i18n";

declare module "next-intl" {
  interface AppConfig {
    Locale: (typeof routing.locales)[number];
    Messages: Messages;
  }
}
