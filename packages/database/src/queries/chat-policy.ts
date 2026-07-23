// =============================================================================
// Conversation policy — the ROLE-PAIR gate: which role may open a conversation
// with which other role. This is the coarse first gate only.
//
// It is ONE of two gates, and it is the weaker one. The real question — "is
// this specific student actually taught by this specific teacher?" — is
// answered by the EDGES table in chat-scope.ts, which is the single source of
// truth for relationship scoping. A pair allowed here is still denied unless a
// real platform relationship backs it.
//
// Both gates run in ONE place (chat-scope.ts assertCanReach); the REST layer
// and the realtime WebSocket server both funnel through it. Hiding something
// in a UI is never the enforcement mechanism.
//
// STRUCTURE: absent = may NOT initiate. A row that is `{}` means the role may
// not start any conversation at all, and an entirely absent role reaches
// nobody — new roles therefore fail CLOSED until deliberately listed here.
// (Replies inside an existing conversation are always allowed for both
// participants, subject to blocks.)
//
// To change who may talk to whom, edit CONVERSATION_INITIATION below and the
// matching edges in chat-scope.ts — nothing else.
// =============================================================================

import type { Role } from "../generated/client/index";

/**
 * "open"       — may start a conversation (a real relationship is still
 *                required, and is checked separately by chat-scope.ts).
 * "escalation" — allowed, but surfaced in a separate UI group so it reads as
 *                the exception rather than the norm.
 *
 * No pair is currently "escalation": per the approved messaging decision
 * (2026-07-22) students and parents message their own teachers DIRECTLY. The
 * mode is retained because ContactView carries it and the UI groups on it, so
 * a future channel can be de-emphasized without a schema or API change.
 */
export type InitiationMode = "open" | "escalation";

export const CONVERSATION_INITIATION: Readonly<
  Record<Role, Readonly<Partial<Record<Role, InitiationMode>>>>
> = {
  // الطالب: مدرّسوه ومساعدوهم، وإدارة السنتر وموظفوه.
  //
  // NOTE (2026-07-22): student→teacher was previously ABSENT here — the old
  // design routed students to assistants first and let teachers open student
  // threads only as an "escalation". Ali's messaging decision replaces that:
  // a student messages the teachers they actually take courses with, directly.
  // The scale rationale behind assistant-first is preserved in the UI (the
  // assistants group is listed first), not in the authorization rules.
  student: {
    teacher: "open",
    assistant: "open",
    center_admin: "open",
    center_staff: "open",
  },
  // ولي الأمر: نفس نطاق ابنه بالضبط (محسوب من روابط الأبناء المعتمدة).
  parent: {
    teacher: "open",
    assistant: "open",
    center_admin: "open",
    center_staff: "open",
  },
  // المدرّس: فريقه، والسنتر، وطلابه وأولياء أمورهم.
  teacher: {
    assistant: "open",
    center_admin: "open",
    center_staff: "open",
    student: "open",
    parent: "open",
  },
  // مساعد المدرّس: مدرّسه الوحيد وطلابه وأولياء أمورهم، والسنتر.
  // النطاق مقيّد بمدرّس واحد فقط (حدّ الخطوة 8) ولا يتوسّع هنا أبداً.
  assistant: {
    teacher: "open",
    student: "open",
    parent: "open",
    center_admin: "open",
    center_staff: "open",
  },
  // السنتر (الإدارة): كل أطرافه — مدرّسوه ومساعدوهم وطلابه وأولياء أمورهم.
  center_admin: {
    student: "open",
    parent: "open",
    teacher: "open",
    assistant: "open",
  },
  // موظفو السنتر: يرثون نطاق السنتر، لكن حسب الدور الوظيفي — الاستقبال يتواصل
  // مع الطلاب وأولياء الأمور فقط، والمدير يرث نطاق السنتر كاملاً، ومحاسب
  // السنتر لا يملك مراسلات إطلاقاً. الحصر الفعلي في EDGES (chat-scope.ts):
  // هذه المصفوفة تسمح بالأزواج الممكنة فقط، والدور الوظيفي يضيّقها.
  center_staff: {
    student: "open",
    parent: "open",
    teacher: "open",
    assistant: "open",
  },
  // Back-office staff live in apps/superadmin, which has no chat surface —
  // super-admin live chat is dropped (approved decision #1; broadcast
  // notifications only). They observe the message log read-only and are NEVER
  // conversation participants. Empty rows = may not initiate anything.
  super_admin: {},
  accountant: {},
};

/** null ⇒ initiation denied by the matrix. */
export function conversationInitiationMode(
  initiator: Role,
  recipient: Role,
): InitiationMode | null {
  return CONVERSATION_INITIATION[initiator]?.[recipient] ?? null;
}
