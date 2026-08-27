import { Link } from "@/i18n/navigation";
import type { AnchorHTMLAttributes } from "react";
import styles from "../marketing.module.css";

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
      <img src={src} alt={caption ?? ""} loading="lazy" decoding="async" />
      {caption ? <figcaption>{caption}</figcaption> : null}
    </figure>
  );
}

export const helpMdxComponents = { a: A, Shot };
