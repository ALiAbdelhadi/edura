"use client";
import { ChildrenGuardianCards } from "@/features/settings/children-guardian-cards";
import { SettingsScreen } from "@/features/settings/settings-screen";

export function ParentSettingsScreen() {
  return <SettingsScreen roleCards={{ family: () => [<ChildrenGuardianCards key="children" />] }} />;
}
