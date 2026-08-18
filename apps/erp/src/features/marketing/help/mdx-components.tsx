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

/**
 * `<Shot caption="…" />` — a labelled frame where a capture will go.
 * `<Shot src="/help/x.png" caption="…" />` — the capture itself.
 *
 * The placeholder branch is kept rather than replaced: an article must still be
 * able to ship ahead of its screenshot and READ as "capture pending" rather than
 * as a broken image, which is the whole reason this component exists.
 *
 * `src` is the base name; the locale suffix is appended by the caller, because
 * the same article renders in two languages off two different captures.
 */
function Shot({ caption, src }: { caption?: string; src?: string }) {
  if (!src) {
    return (
      <figure className={styles.shot} role="img" aria-label={caption ?? ""}>
        <figcaption>{caption}</figcaption>
      </figure>
    );
  }
  return (
    <figure className={styles.shotImage}>
      {/* Plain <img>: these are pre-sized static PNGs under /public served by the
          same origin, so next/image's optimiser buys nothing and would add a
          runtime dependency to a statically generated marketing page. */}
      <img src={src} alt={caption ?? ""} loading="lazy" decoding="async" />
      {caption ? <figcaption>{caption}</figcaption> : null}
    </figure>
  );
}

export const helpMdxComponents = { a: A, Shot };
