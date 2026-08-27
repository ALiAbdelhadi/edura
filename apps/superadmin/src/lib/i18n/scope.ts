import type { AbstractIntlMessages } from "next-intl";
import en from "@/messages/en.json";

const BASE_KEYS = Object.keys(en) as ReadonlyArray<string>;

function pick(
  messages: AbstractIntlMessages,
  keys: ReadonlyArray<string>,
): AbstractIntlMessages {
  const out: Record<string, unknown> = {};
  for (const key of keys) {
    if (key in messages) out[key] = (messages as Record<string, unknown>)[key];
  }
  return out as AbstractIntlMessages;
}

export function baseMessages(messages: AbstractIntlMessages) {
  return pick(messages, BASE_KEYS);
}
