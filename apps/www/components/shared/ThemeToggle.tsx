"use client";

import React from "react";
import { Segmented, Tooltip } from "antd";
import { useThemeMode, type ThemeMode } from "@/components/providers/ThemeModeProvider";
import { useI18n } from "@/components/providers/I18nProvider";

/**
 * Theme switcher (PRD §0 non-negotiable #5): light / dark / system, with the
 * device preference honored in "system". Icon-only options carry aria-labels.
 */
export function ThemeToggle() {
  const { mode, setMode } = useThemeMode();
  const { t, dir } = useI18n();

  const label = (m: ThemeMode) => {
    const key = `theme.${m}`;
    const translated = t(key);
    return translated === key ? { light: "Light", dark: "Dark", system: "Auto" }[m] : translated;
  };

  return (
    <Tooltip title={label("system")}>
      <Segmented
        aria-label={t("theme.label") === "theme.label" ? "Theme" : t("theme.label")}
        value={mode}
        onChange={(v) => setMode(v as ThemeMode)}
        size="small"
        options={[
          { value: "light", label: <SunIcon />, title: label("light") },
          { value: "dark", label: <MoonIcon />, title: label("dark") },
          { value: "system", label: <AutoIcon />, title: label("system") },
        ]}
        // Segmented mirrors automatically under RTL; keep DOM order stable.
        style={{ direction: dir }}
      />
    </Tooltip>
  );
}

function iconProps(label: string) {
  return {
    width: 15,
    height: 15,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    role: "img" as const,
    "aria-label": label,
  };
}

const SunIcon = () => (
  <svg {...iconProps("Light")}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M6.3 17.7l-1.4 1.4M19.1 4.9l-1.4 1.4" />
  </svg>
);
const MoonIcon = () => (
  <svg {...iconProps("Dark")}>
    <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
  </svg>
);
const AutoIcon = () => (
  <svg {...iconProps("Auto")}>
    <rect x="2" y="3" width="20" height="14" rx="2" />
    <path d="M8 21h8M12 17v4" />
  </svg>
);
