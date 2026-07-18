// Teacher team management: assistants are real user accounts (role=assistant)
// created/linked by their teacher. Assistants are the primary chat contact
// point for the teacher's students and parents (see chat-policy.ts).
import bcrypt from "bcryptjs";
import { scopedDb } from "@/lib/db/scope";
import {
  BusinessRuleError,
  ConflictError,
  NotFoundError,
} from "@/lib/errors/classes";
import type { SessionUser } from "@/lib/auth/session";

export async function listAssistants(teacher: SessionUser) {
  return scopedDb(teacher, async (tx) => {
    const links = await tx.teacherAssistant.findMany({
      where: { teacherId: teacher.id, removedAt: null },
      orderBy: { createdAt: "asc" },
    });
    if (!links.length) return [];
    const users = await tx.user.findMany({
      where: { id: { in: links.map((l) => l.assistantId) } },
      select: { id: true, name: true, email: true, status: true },
    });
    const userMap = new Map(users.map((u) => [u.id, u]));
    return links.map((l) => ({
      id: l.id,
      assistantId: l.assistantId,
      title: l.title,
      createdAt: l.createdAt,
      user: userMap.get(l.assistantId) ?? null,
    }));
  });
}

export async function createAssistant(
  teacher: SessionUser,
  input: { name: string; email: string; password: string; title?: string },
) {
  const email = input.email.toLowerCase().trim();
  return scopedDb(teacher, async (tx) => {
    let assistantUser = await tx.user.findUnique({ where: { email } });

    if (assistantUser) {
      if (assistantUser.role !== "assistant") {
        throw new ConflictError(
          "This email belongs to an existing account with a different role",
        );
      }
      if (assistantUser.deletedAt || assistantUser.status !== "active") {
        throw new BusinessRuleError("This assistant account is not active");
      }
      const existing = await tx.teacherAssistant.findUnique({
        where: {
          teacherId_assistantId: {
            teacherId: teacher.id,
            assistantId: assistantUser.id,
          },
        },
      });
      if (existing && !existing.removedAt) {
        throw new ConflictError("This assistant is already on your team");
      }
      if (existing) {
        // Re-activate a previously removed membership.
        const link = await tx.teacherAssistant.update({
          where: { id: existing.id },
          data: { removedAt: null, title: input.title ?? existing.title },
        });
        return { link, user: assistantUser, existingAccount: true };
      }
    } else {
      assistantUser = await tx.user.create({
        data: {
          email,
          name: input.name.trim(),
          role: "assistant",
          status: "active",
          passwordHash: await bcrypt.hash(input.password, 10),
        },
      });
    }

    const link = await tx.teacherAssistant.create({
      data: {
        teacherId: teacher.id,
        assistantId: assistantUser.id,
        title: input.title?.trim() || null,
      },
    });
    return { link, user: assistantUser, existingAccount: false };
  });
}

export async function removeAssistant(teacher: SessionUser, linkId: string) {
  return scopedDb(teacher, async (tx) => {
    const link = await tx.teacherAssistant.findFirst({
      where: { id: linkId, teacherId: teacher.id, removedAt: null },
    });
    if (!link) throw new NotFoundError("Assistant not found on your team");
    await tx.teacherAssistant.update({
      where: { id: link.id },
      data: { removedAt: new Date() },
    });
    return { removed: true };
  });
}
