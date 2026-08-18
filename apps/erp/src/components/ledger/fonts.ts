import { IBM_Plex_Mono } from "next/font/google";

export const ledgerMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
  variable: "--ledger-mono",
});
