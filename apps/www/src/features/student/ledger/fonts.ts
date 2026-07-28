import { IBM_Plex_Mono } from "next/font/google";

/**
 * IBM Plex Mono — the Ledger's figure face.
 *
 * Loaded here rather than in the root layout because the root layout is shared
 * by every portal and is not this session's to edit. `next/font` may be
 * initialised in any module; the resulting `.variable` class just has to be
 * applied to an ancestor of the text that uses it, which the student layout
 * does.
 *
 * When the foundation lands the shared layer it should move this to the root
 * layout alongside IBM Plex Sans Arabic, and this file goes away with the rest
 * of `features/student/ledger/`.
 */
export const ledgerMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
  variable: "--ledger-mono",
});
