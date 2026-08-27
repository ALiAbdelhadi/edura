export type ObservabilityRole =
  | "student"
  | "parent"
  | "teacher"
  | "assistant"
  | "center_admin"
  | "center_staff"
  | "super_admin"
  | "accountant";

export type SessionLike = {
  id: string;
  role: string;
  centerId?: string | null;
};

export function isMinorRole(role: string): boolean {
  return role === "student";
}

export type ObservabilityIdentity = {
  id: string;
  role: string;
  centerId?: string;
};

export function observabilityIdentity(
  session: SessionLike | null | undefined,
): ObservabilityIdentity | null {
  if (!session?.id || !session.role) return null;
  if (isMinorRole(session.role)) return null;

  return {
    id: session.id,
    role: session.role,
    ...(session.centerId ? { centerId: session.centerId } : {}),
  };
}
