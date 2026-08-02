import { notFound } from "next/navigation";

/**
 * Catch-all for paths no route matched — without it an unknown URL renders
 * Next's default English 404 instead of the localized not-found page in this
 * segment. Same reasoning as apps/www.
 */
export default function CatchAll() {
  notFound();
}
