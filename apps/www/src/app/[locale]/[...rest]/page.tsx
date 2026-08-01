import { notFound } from "next/navigation";

/**
 * Catch-all for paths no route matched (deeper than the [id] public-profile
 * segment) — without it an unknown URL renders Next's default English 404
 * instead of the localized not-found page in this segment.
 */
export default function CatchAll() {
  notFound();
}
