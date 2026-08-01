"use client";

import { Sun, Moon, Monitor } from "lucide-react";
import { ToggleGroup, ToggleGroupItem } from "@repo/ui/components/toggle-group";
import {
  useThemeMode,
  type ThemeMode,
} from "@/components/providers/theme-mode-provider";
import { useTranslations } from "next-intl";

export function ThemeToggle() {
  const { mode, setMode } = useThemeMode();
  const t = useTranslations();
  const label = (m: ThemeMode) => t(("theme." + m) as Parameters<typeof t>[0]);

  return (
    <ToggleGroup
      type="single"
      size="default"
      variant="default"
      spacing={1}
      value={mode}
      onValueChange={(v) => v && setMode(v as ThemeMode)}
      aria-label={t("theme.label")}
    >
      <ToggleGroupItem
        value="light"
        aria-label={label("light")}
        title={label("light")}
      >
        <Sun className="size-4" />
      </ToggleGroupItem>
      <ToggleGroupItem
        value="dark"
        aria-label={label("dark")}
        title={label("dark")}
      >
        <Moon className="size-4" />
      </ToggleGroupItem>
      <ToggleGroupItem
        value="system"
        aria-label={label("system")}
        title={label("system")}
      >
        <Monitor className="size-4" />
      </ToggleGroupItem>
    </ToggleGroup>
  );
}
