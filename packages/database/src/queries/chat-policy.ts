import type { Role } from "../generated/client/index";

export type InitiationMode = "open" | "escalation";

export const CONVERSATION_INITIATION: Readonly<
  Record<Role, Readonly<Partial<Record<Role, InitiationMode>>>>
> = {
  student: {
    teacher: "open",
    assistant: "open",
    center_admin: "open",
    center_staff: "open",
  },
  parent: {
    teacher: "open",
    assistant: "open",
    center_admin: "open",
    center_staff: "open",
  },
  teacher: {
    assistant: "open",
    center_admin: "open",
    center_staff: "open",
    student: "open",
    parent: "open",
  },
  assistant: {
    teacher: "open",
    student: "open",
    parent: "open",
    center_admin: "open",
    center_staff: "open",
  },
  center_admin: {
    student: "open",
    parent: "open",
    teacher: "open",
    assistant: "open",
  },
  center_staff: {
    student: "open",
    parent: "open",
    teacher: "open",
    assistant: "open",
  },
  super_admin: {},
  accountant: {},
};

export function conversationInitiationMode(
  initiator: Role,
  recipient: Role,
): InitiationMode | null {
  return CONVERSATION_INITIATION[initiator]?.[recipient] ?? null;
}
