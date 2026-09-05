import type { AbstractIntlMessages } from "next-intl";

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

/**
 * Message scoping for a layout: hand the client only the namespaces a route
 * tree needs. The BASE set is whatever the app's default dictionary declares
 * at top level -- that file is app-owned, so each app builds its own scope
 * from it and the picking logic lives here once.
 */
export function createMessageScope(base: AbstractIntlMessages) {
  const baseKeys = Object.keys(base) as ReadonlyArray<string>;
  return {
    baseMessages: (messages: AbstractIntlMessages) => pick(messages, baseKeys),
    withNamespaces:
      (...namespaces: string[]) =>
      (messages: AbstractIntlMessages) =>
        pick(messages, [...baseKeys, ...namespaces]),
  };
}
