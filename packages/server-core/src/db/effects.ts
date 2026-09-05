export type DeferredEffect = () => Promise<void>;

export type WithEffects<T> = { value: T; effects: DeferredEffect[] };

// Post-commit work — notifications, mail, WhatsApp — collected inside a
// transaction and run after it commits. It must never run inside one: notify()
// awaits SMTP, SMS, FCM and web-push, and holding a pooled Neon connection open
// across those round-trips is how a 20s transaction timeout happens in
// production and never in a test, where every channel is mocked.
export async function runEffects(effects: DeferredEffect[]): Promise<void> {
  for (const effect of effects) await effect();
}

export function withEffects<T>(value: T, effects: DeferredEffect[] = []): WithEffects<T> {
  return { value, effects };
}
