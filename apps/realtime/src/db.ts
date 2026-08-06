import {
  prisma,
  runWithContext,
  withPlatformContext,
  type TenantTx,
} from "@repo/database";
import "./env";

export function chatDb<T>(
  actorId: string,
  fn: (tx: TenantTx) => Promise<T>,
): Promise<T> {
  return runWithContext({ actorId }, () => withPlatformContext(fn));
}

export async function disconnectDb(): Promise<void> {
  await prisma.$disconnect();
}
