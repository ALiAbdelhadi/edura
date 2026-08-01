import { Link } from "@/i18n/navigation";
import type { AnchorHTMLAttributes } from "react";
import styles from "../marketing.module.css";

/**
 * The component map handed to MDXRemote.
 *
 * Block elements are styled by the `.prose` wrapper rather than overridden one
 * by one, so an article author can use ordinary Markdown and still land inside
 * the Ledger type scale. Only two things need real components:
 *
 *  - `a`   — an in-app path must go through the locale-aware <Link>, or an
 *            Arabic reader clicking «الأسعار» lands on the English page. An
 *            external link additionally gets rel="noopener noreferrer".
 *  - Shot  — the screenshot placeholder, so an article can ship before its
 *            capture exists and READ as "capture pending" rather than broken.
 */

function A({ href = "", children, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement>) {
  const internal = href.startsWith("/");
  if (internal) {
    return (
      <Link href={href} {...rest}>
        {children}
      </Link>
    );
  }
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" {...rest}>
      {children}
    </a>
  );
}

/** `<Shot caption="…" />` — a labelled frame where a capture will go. */
function Shot({ caption }: { caption?: string }) {
  return (
    <figure className={styles.shot} role="img" aria-label={caption ?? ""}>
      <figcaption>{caption}</figcaption>
    </figure>
  );
}

export const helpMdxComponents = { a: A, Shot };
