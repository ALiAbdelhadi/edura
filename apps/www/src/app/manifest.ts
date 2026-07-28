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
    background_color: "#14161c",
    theme_color: "#f7f6f2",
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
