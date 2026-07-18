import type { MetadataRoute } from "next";

export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Edura",
    short_name: "Edura",
    description: "Edura — education management platform",
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
