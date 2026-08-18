import { IBM_Plex_Mono } from "next/font/google";

/**
 * IBM Plex Mono — mandatory for every number, amount, date, ID, email, ref,
 * code and count badge in the Ledger system.
 *
 * Loaded here rather than in app/[locale]/layout.tsx because that root layout is
 * shared by all six portals and belongs to no single session. Scoping the load
 * to the two layouts that use it also keeps the font off every other portal's
 * critical path until the foundation session promotes it globally.
 */
export const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-plex-mono",
  display: "swap",
});
