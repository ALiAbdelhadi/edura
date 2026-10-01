import type { SessionLike } from "@repo/observability";

// Who the current request is for, handed to the error tracker. server-core
// carries no Sentry SDK; the Next app registers its `tagSentryUser`, a service
// registers its own, and until one is registered tagging is a no-op.
export type UserTagger = (session: SessionLike | null | undefined) => void;

let tagger: UserTagger = () => undefined;

export function setUserTagger(next: UserTagger): void {
  tagger = next;
}

export function tagUser(session: SessionLike | null | undefined): void {
  tagger(session);
}
