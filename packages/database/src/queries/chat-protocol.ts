// =============================================================================
// Realtime chat wire protocol — event names + payload types shared by the
// standalone Socket.IO server (apps/realtime), the Next.js REST layer, and the
// browser client. Pure types/constants: safe to import anywhere.
// =============================================================================

import type { Role } from "../generated/client/index";
import type { ChatErrorCode, MessageView } from "./chat";

// ---- client → server ----
export const EV_MESSAGE_SEND = "message:send";
export const EV_CONVERSATION_READ = "conversation:read";
export const EV_TYPING = "typing";

export type SendMessagePayload = {
  conversationId?: string;
  recipientId?: string;
  body: string;
  /** Client-generated UUID — idempotency across reconnect retries. */
  clientId?: string;
};

export type SendMessageAck =
  | { ok: true; message: MessageView; duplicate: boolean }
  | { ok: false; code: ChatErrorCode | "internal_error"; message: string };

export type ConversationReadPayload = { conversationId: string };

export type TypingPayload = { conversationId: string; typing: boolean };

// ---- server → client ----
export const EV_MESSAGE_NEW = "message:new";
export const EV_MESSAGE_DELIVERED = "message:delivered";
export const EV_CONVERSATION_READ_FANOUT = "conversation:read";
export const EV_TYPING_FANOUT = "typing";
export const EV_PRESENCE_STATE = "presence:state";
export const EV_PRESENCE_UPDATE = "presence:update";

export type MessageNewEvent = {
  message: MessageView;
  sender: { id: string; name: string; role: Role };
};

/** Covers both a single live delivery and the delivered-on-connect sweep. */
export type MessageDeliveredEvent = {
  conversationId: string;
  /** All own messages with seq ≤ upToSeq are now at least "delivered". */
  upToSeq: number;
  deliveredAt: string;
};

export type ConversationReadEvent = {
  conversationId: string;
  readerId: string;
  readAt: string;
};

export type TypingEvent = {
  conversationId: string;
  userId: string;
  typing: boolean;
};

/** Sent once after connect: which of my conversation partners are online now. */
export type PresenceStateEvent = { online: string[] };

export type PresenceUpdateEvent = { userId: string; online: boolean };

// ---- server ↔ server bridge (Next.js REST → realtime fanout) ----
export type BridgeMessagePayload = {
  message: MessageView;
  recipientId: string;
  sender: { id: string; name: string; role: Role };
};

export type BridgeReadPayload = ConversationReadEvent & { otherUserId: string };
