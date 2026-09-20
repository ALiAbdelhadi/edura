"use client";
import { GuardianContactCard } from "@/features/settings/guardian-contact-card";
import { SettingsScreen } from "@/features/settings/settings-screen";
import { StudentIdSettingsCard } from "@/features/student/student-id-settings-card";

export function StudentSettingsScreen() {
  return (
    <SettingsScreen
      roleCards={{
        profile: () => [<StudentIdSettingsCard key="id" />],
        family: () => [<GuardianContactCard key="guardian" />],
      }}
    />
  );
}
