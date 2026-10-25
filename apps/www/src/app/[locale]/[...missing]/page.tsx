import { notFound } from "next/navigation";

// Any unknown path under a locale lands here, so the 404 renders inside the
// locale layout (nav, footer, fonts, theme) instead of Next's bare default.
export default function MissingPage() {
  notFound();
}
