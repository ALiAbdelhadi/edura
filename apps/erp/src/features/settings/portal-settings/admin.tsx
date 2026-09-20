"use client";
import { CenterProfileCard } from "@/features/settings/center-profile-card";
import { ProfileImageCard } from "@/features/settings/profile-image-card";
import { PublicHandleCard } from "@/features/settings/public-handle-card";
import { SettingsScreen } from "@/features/settings/settings-screen";

export function AdminSettingsScreen() {
  return (
    <SettingsScreen
      roleCards={{
        profile: (me) => [
          <ProfileImageCard key="logo" variant="centerLogo" name={me?.name ?? undefined} />,
          <CenterProfileCard key="center" />,
          <PublicHandleCard key="handle" />,
        ],
      }}
    />
  );
}
