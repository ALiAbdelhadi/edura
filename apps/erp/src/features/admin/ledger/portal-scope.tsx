"use client";
import { useEffect } from "react";

export function LedgerPortalScope() {
  useEffect(() => {
    const root = document.documentElement;
    const previous = root.getAttribute("data-portal");
    root.setAttribute("data-portal", "ledger");
    return () => {
      if (previous === null) root.removeAttribute("data-portal");
      else root.setAttribute("data-portal", previous);
    };
  }, []);

  return null;
}
