import { prisma } from "../client";

/**
 * Domain-level auth queries. Route handlers call these instead of touching
 * Prisma directly, keeping all DB access inside @repo/database.
 */

export function findUserByEmail(email: string) {
  return prisma.user.findUnique({ where: { email: email.toLowerCase() } });
}

export function findUserByPhone(phone: string) {
  return prisma.user.findUnique({ where: { phone } });
}

export function findUserById(id: string) {
  return prisma.user.findUnique({ where: { id } });
}
