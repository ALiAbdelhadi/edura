import type {
  ContactView,
  ConversationView,
  MessageView,
} from "@repo/database/chat";

type Iso<T, K extends keyof T> = Omit<T, K> & {
  [P in K]: T[P] extends Date ? string : string | null;
};

export type WireMessage = Iso<
  MessageView,
  "deliveredAt" | "readAt" | "createdAt"
>;

export type WireConversation = Iso<
  ConversationView,
  "lastMessageAt" | "partnerLastReadAt" | "createdAt"
>;

export type WireContact = ContactView;

export type UiMessage = WireMessage & {
  /** Optimistic: sent locally, no server ack yet. */
  pending?: boolean;
  /** Both socket and REST fallback failed — offer retry. */
  failed?: boolean;
};

export type ChatConnectionStatus = "connecting" | "online" | "offline";

export type Envelope<T> = { data: T; meta?: Record<string, unknown> };
