import { createNavigation } from "next-intl/navigation";
import { routing } from "./routing";

/**
 * Locale-aware navigation wrappers. Use these instead of the ones from
 * `next/navigation` / `next/link` so the active locale prefix is preserved
 * automatically (and the language switcher can swap only the locale segment).
 */
export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing);
