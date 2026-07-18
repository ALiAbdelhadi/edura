// Database context for the realtime server. Chat authorization is
// participant/relationship-based (enforced inside @repo/database queries/chat),
// so socket operations run under the platform RLS context with the actor id
// recorded for auditing — the same context Next.js uses for non-center roles.
import "./env";
import {
  prisma,
  runWithContext,
  withPlatformContext,
  type TenantTx,
} from "@repo/database";

export function chatDb<T>(
  actorId: string,
  fn: (tx: TenantTx) => Promise<T>,
): Promise<T> {
  return runWithContext({ actorId }, () => withPlatformContext(fn));
}

export async function disconnectDb(): Promise<void> {
  await prisma.$disconnect();
}
