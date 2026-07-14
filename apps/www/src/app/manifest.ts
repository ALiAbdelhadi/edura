import type { MetadataRoute } from "next";

// Served at /manifest.webmanifest — the dot in the filename means the next-intl
// middleware skips it (no locale redirect).
export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Edura",
    short_name: "Edura",
    description: "Edura — education management platform",
    // "/" 307-redirects to the negotiated locale (/ar or /en) via middleware.
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    dir: "auto",
    lang: "ar",
    background_color: "#0b1020",
    theme_color: "#5b76fe",
    icons: [
      {
        src: "/edura-mark.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: "/edura-maskable.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "maskable",
      },
    ],
  };
}
