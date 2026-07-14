import { prisma } from "../client";


export function findUserByEmail(email: string) {
  return prisma.user.findUnique({ where: { email: email.toLowerCase() } });
}

export function findUserByPhone(phone: string) {
  return prisma.user.findUnique({ where: { phone } });
}

export function findUserById(id: string) {
  return prisma.user.findUnique({ where: { id } });
}
