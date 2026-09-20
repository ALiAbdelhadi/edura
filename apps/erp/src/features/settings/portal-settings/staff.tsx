"use client";
import { ProfileImageCard } from "@/features/settings/profile-image-card";
import { SettingsScreen } from "@/features/settings/settings-screen";

// Only a manager may change the centre's logo; the API enforces it, this mirrors it.
export function StaffSettingsScreen() {
  return (
    <SettingsScreen
      roleCards={{
        profile: (me) =>
          me?.staffRole === "manager"
            ? [<ProfileImageCard key="logo" variant="centerLogo" name={me?.name ?? undefined} />]
            : [],
      }}
    />
  );
}
