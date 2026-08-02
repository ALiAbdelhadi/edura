import { getRequestConfig } from "next-intl/server";
import { hasLocale } from "next-intl";
import { routing } from "./routing";
import { getMessages, type Locale, type Messages } from "@/lib/i18n";

const FALLBACK_LOCALE: Locale = "en";

type Dict = Record<string, unknown>;

function deepMerge(base: Dict, override: Dict): Dict {
  const out: Dict = { ...base };
  for (const key of Object.keys(override)) {
    const b = base[key];
    const o = override[key];
    const bothPlainObjects =
      o !== null &&
      typeof o === "object" &&
      !Array.isArray(o) &&
      b !== null &&
      typeof b === "object" &&
      !Array.isArray(b);
    out[key] = bothPlainObjects ? deepMerge(b as Dict, o as Dict) : o;
  }
  return out;
}

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested)
    ? requested
    : routing.defaultLocale;

  // Same merge-over-English strategy as www: a missing Arabic key renders the
  // English string rather than the raw key path. The parity test is what stops
  // that from becoming a way to ship untranslated copy unnoticed.
  const messages =
    locale === FALLBACK_LOCALE
      ? getMessages(FALLBACK_LOCALE)
      : (deepMerge(
          getMessages(FALLBACK_LOCALE) as Dict,
          getMessages(locale) as Dict,
        ) as Messages);

  return { locale, messages };
});
