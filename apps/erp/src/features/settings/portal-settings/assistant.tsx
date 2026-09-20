"use client";
import { AttendanceModeCard } from "@/features/settings/attendance-mode-card";
import { SettingsScreen } from "@/features/settings/settings-screen";

export function AssistantSettingsScreen() {
  return <SettingsScreen roleCards={{ profile: () => [<AttendanceModeCard key="attendance" />] }} />;
}
