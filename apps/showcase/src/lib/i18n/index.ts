import en from "@/messages/en.json";
import ar from "@/messages/ar.json";

export const LOCALES = ["ar", "en"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "ar";

/**
 * The showcase is small enough for one file per locale — www splits into
 * namespaces because six portals edit it concurrently and two sessions
 * touching one file collide (CONSTITUTION.md §7). That pressure does not exist
 * here.
 *
 * `Messages` is typed from the ENGLISH dictionary and `ar` is asserted against
 * it, exactly as www does, so a key added to one locale and forgotten in the
 * other fails to compile rather than falling back silently at runtime. The
 * parity test in tests/unit covers the reverse direction (a key in `ar` that
 * never reached `en`).
 */
export type Messages = typeof en;

const dictionaries: Record<Locale, Messages> = {
  en,
  ar: ar as Messages,
};

export function getMessages(locale: Locale): Messages {
  return dictionaries[locale] ?? dictionaries[DEFAULT_LOCALE];
}

export function isLocale(v: string | undefined): v is Locale {
  return !!v && (LOCALES as readonly string[]).includes(v);
}
