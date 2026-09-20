"use client";
import { AttendanceModeCard } from "@/features/settings/attendance-mode-card";
import { ProfileImageCard } from "@/features/settings/profile-image-card";
import { PublicHandleCard } from "@/features/settings/public-handle-card";
import { SettingsScreen } from "@/features/settings/settings-screen";

export function TeacherSettingsScreen() {
  return (
    <SettingsScreen
      roleCards={{
        profile: (me) => [
          <AttendanceModeCard key="attendance" />,
          <ProfileImageCard key="photo" variant="teacherPhoto" name={me?.name ?? undefined} />,
          <PublicHandleCard key="handle" />,
        ],
      }}
    />
  );
}
