import bcrypt from "bcryptjs";
import { platformDb, type TenantTx } from "@/lib/db/scope";
import { ConflictError, BusinessRuleError } from "@/lib/errors/classes";
import { generateFamilyCode, generateCenterShortId } from "@/lib/utils/random";

type StudentInput = {
  email: string;
  password: string;
  name: string;
  phone?: string;
  locale?: "ar" | "en";
  inviteCode?: string;
};

type ParentInput = StudentInput;

type CenterInput = {
  admin: { email: string; password: string; name: string; locale?: "ar" | "en" };
  center: {
    name: string;
    description?: string;
    subjects?: string[];
    address?: string;
    phone?: string;
    whatsapp?: string;
    email?: string;
  };
};

const BCRYPT_COST = 10;

async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_COST);
}

async function ensureUniqueUnshelled(tx: TenantTx, email: string, phone?: string) {
  const conflicts = await tx.user.findFirst({
    where: {
      status: { not: "shell" },
      OR: [{ email }, ...(phone ? [{ phone }] : [])],
    },
  });
  if (conflicts) {
    throw new ConflictError("Email or phone already in use");
  }
}

export async function registerStudent(input: StudentInput) {
  const email = input.email.toLowerCase().trim();
  const phone = input.phone?.trim() || undefined;
  const passwordHash = await hashPassword(input.password);

  const user = await platformDb(async (tx) => {
    await ensureUniqueUnshelled(tx, email, phone);

    // Temp-student merge (PRD §5.4): find a claimable shell by email, then by
    // phone, then by invite code. Activating the shell in place preserves every
    // historical record (attendance/grades/payments) — they key on users.id.
    let shell = await tx.user.findFirst({ where: { email, status: "shell" } });
    if (!shell && phone) {
      shell = await tx.user.findFirst({ where: { phone, status: "shell" } });
    }
    if (!shell && input.inviteCode) {
      const invited = await tx.studentProfile.findUnique({ where: { inviteCode: input.inviteCode } });
      if (invited?.userId) {
        shell = await tx.user.findFirst({ where: { id: invited.userId, status: "shell" } });
      }
    }

    let user;
    if (shell) {
      if (shell.role !== "student") {
        throw new ConflictError("Shell exists for this contact with a different role");
      }
      user = await tx.user.update({
        where: { id: shell.id },
        data: {
          email,
          passwordHash,
          name: input.name,
          status: "active",
          ...(phone ? { phone } : {}),
          ...(input.locale ? { locale: input.locale } : {}),
        },
      });
    } else {
      user = await tx.user.create({
        data: {
          email,
          phone,
          passwordHash,
          role: "student",
          name: input.name,
          locale: input.locale ?? "ar",
          status: "active",
        },
      });
    }

    // Mark the profile registered (claiming an invited temp profile if present).
    await tx.studentProfile.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        fullName: input.name,
        familyLinkCode: generateFamilyCode(),
        entityType: "registered",
      },
      update: {
        entityType: "registered",
        claimedAt: new Date(),
        ...(phone ? { phone } : {}),
      },
    });

    return user;
  });

  return {
    userId: user.id,
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
      status: user.status,
    },
  };
}

export async function registerParent(input: ParentInput) {
  const email = input.email.toLowerCase().trim();
  const phone = input.phone?.trim() || undefined;
  const passwordHash = await hashPassword(input.password);

  const user = await platformDb(async (tx) => {
    await ensureUniqueUnshelled(tx, email, phone);
    const shell = await tx.user.findFirst({ where: { email, status: "shell" } });

    let user;
    if (shell) {
      if (shell.role !== "parent") {
        throw new ConflictError("Shell exists for this email with a different role");
      }
      user = await tx.user.update({
        where: { id: shell.id },
        data: {
          passwordHash,
          name: input.name,
          status: "active",
          ...(phone ? { phone } : {}),
          ...(input.locale ? { locale: input.locale } : {}),
        },
      });
    } else {
      user = await tx.user.create({
        data: {
          email,
          phone,
          passwordHash,
          role: "parent",
          name: input.name,
          locale: input.locale ?? "ar",
          status: "active",
        },
      });
    }

    await tx.parentProfile.upsert({
      where: { userId: user.id },
      create: { userId: user.id },
      update: {},
    });

    return user;
  });

  return {
    userId: user.id,
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
      status: user.status,
    },
  };
}

async function uniqueCenterShortId(tx: TenantTx, attempt = 0): Promise<string> {
  if (attempt > 8) {
    throw new BusinessRuleError("Failed to allocate unique center shortId");
  }
  const candidate = generateCenterShortId();
  const exists = await tx.center.findFirst({
    where: { shortId: candidate },
    select: { id: true },
  });
  if (exists) return uniqueCenterShortId(tx, attempt + 1);
  return candidate;
}

export async function registerCenter(input: CenterInput) {
  const email = input.admin.email.toLowerCase().trim();
  const passwordHash = await hashPassword(input.admin.password);

  // platformDb opens an interactive transaction, so all writes below are atomic
  // (replacing the previous mongoose session.withTransaction).
  return platformDb(async (tx) => {
    await ensureUniqueUnshelled(tx, email);
    const shortId = await uniqueCenterShortId(tx);

    const center = await tx.center.create({
      data: {
        name: input.center.name,
        shortId,
        description: input.center.description ?? "",
        subjects: input.center.subjects ?? [],
        address: input.center.address ?? "",
        phone: input.center.phone ?? "",
        whatsapp: input.center.whatsapp ?? "",
        email: input.center.email ?? "",
        status: "active",
        receiptSeq: 0,
      },
    });

    const shell = await tx.user.findFirst({ where: { email, status: "shell" } });
    let user;
    if (shell) {
      if (shell.role !== "center_admin") {
        throw new ConflictError("Shell exists for this email with a different role");
      }
      user = await tx.user.update({
        where: { id: shell.id },
        data: {
          passwordHash,
          name: input.admin.name,
          status: "active",
          ...(input.admin.locale ? { locale: input.admin.locale } : {}),
        },
      });
    } else {
      user = await tx.user.create({
        data: {
          email,
          passwordHash,
          role: "center_admin",
          name: input.admin.name,
          locale: input.admin.locale ?? "ar",
          status: "active",
        },
      });
    }

    await tx.centerAdminProfile.create({
      data: { userId: user.id, centerId: center.id },
    });

    return { userId: user.id, centerId: center.id, shortId };
  });
}

export async function ensureTeacherProfile(userId: string) {
  await platformDb((tx) =>
    tx.teacherProfile.upsert({
      where: { userId },
      create: { userId },
      update: {},
    }),
  );
}
