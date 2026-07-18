// =============================================================================
// Conversation policy — THE single source of truth for who may open a 1:1
// conversation with whom. Enforced on the backend (Next.js REST + realtime
// WebSocket server both call through queries/chat.ts, which gates every new
// conversation on this matrix). The UI only mirrors it via the contacts
// directory; hiding something in the UI is never the enforcement mechanism.
//
// Design principle (scale): a teacher cannot personally handle every student.
// Assistants are the primary contact point for students/parents; the teacher
// coordinates the team and steps into ESCALATIONS only. That is why
// student→teacher is absent (denied) while teacher→student is "escalation":
// the teacher side opens the conversation when a case is escalated, and the
// student can then reply inside it — replying within an existing conversation
// is always allowed for both participants.
//
// To change the rules, edit CONVERSATION_INITIATION below — nothing else.
// =============================================================================

import type { Role } from "../generated/client/index";

/**
 * "open"       — may freely start a conversation (relationship still required).
 * "escalation" — allowed, but intended for escalated cases only; UIs group
 *                these contacts separately so the norm stays assistant-first.
 * absent       — may NOT initiate. (Replies inside an existing conversation
 *                are always allowed for both participants.)
 */
export type InitiationMode = "open" | "escalation";

export const CONVERSATION_INITIATION: Readonly<
  Record<Role, Readonly<Partial<Record<Role, InitiationMode>>>>
> = {
  // الطالب: قناته الأساسية مساعد المدرّس، واللوجستيات مع السنتر.
  student: {
    assistant: "open",
    center_admin: "open",
  },
  // ولي الأمر: نفس قنوات الطالب.
  parent: {
    assistant: "open",
    center_admin: "open",
  },
  // المدرّس: تنسيق داخلي مع فريقه والسنتر؛ الطالب/ولي الأمر للتصعيد فقط.
  teacher: {
    assistant: "open",
    center_admin: "open",
    student: "escalation",
    parent: "escalation",
  },
  // مساعد المدرّس: نقطة الاتصال الأساسية — طلاب وأولياء أمور مدرّسه + السنتر.
  assistant: {
    student: "open",
    parent: "open",
    teacher: "open",
    center_admin: "open",
  },
  // السنتر (الإدارة): يتواصل مع كل أطرافه.
  center_admin: {
    student: "open",
    parent: "open",
    teacher: "open",
    assistant: "open",
  },
  // الأدمن: دعم المنصّة — يبدأ مع أي حد؛ لا أحد يبدأ معه.
  super_admin: {
    student: "open",
    parent: "open",
    teacher: "open",
    assistant: "open",
    center_admin: "open",
    accountant: "open",
  },
  accountant: {
    super_admin: "open",
  },
};

/** null ⇒ initiation denied by the matrix. */
export function conversationInitiationMode(
  initiator: Role,
  recipient: Role,
): InitiationMode | null {
  return CONVERSATION_INITIATION[initiator]?.[recipient] ?? null;
}
