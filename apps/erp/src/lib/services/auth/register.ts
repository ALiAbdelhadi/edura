import { platformDb, type TenantTx } from "@/lib/db/scope";
import { BusinessRuleError, ConflictError } from "@/lib/errors/classes";
import { generateCenterShortId, generateFamilyCode } from "@/lib/utils/random";
import bcrypt from "bcryptjs";

type StudentInput = {
  email: string;
  password: string;
  name: string;
  phone?: string;
  locale?: "ar" | "en";
  inviteCode?: string;
};

type ParentInput = StudentInput;

type TeacherInput = Omit<StudentInput, "inviteCode">;

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

/**
 * SECURITY_AUDIT.md H-02. This used to skip `shell` rows, and each register
 * function then looked a shell up by the submitted email or PHONE and activated
 * it in place with the caller's password — no invite, no token, no proof of
 * control. A walk-in child's account (wallet, roster, attendance, grades) went
 * to whoever typed the child's 11-digit phone number first.
 *
 * Now a shell counts as taken like any other row. The ONLY way public
 * registration may absorb a shell is a temp-student invite code (40-bit, single
 * use, `entityType: "invited"`), and only for the shell that code names — which
 * `allowUserId` exempts from this check. Every other merge stays behind the doors
 * that prove control: the walk-in claim link (`invite-token` plugin), the
 * post-registration `temp-students/claim` code, and the teacher invite token.
 */
async function ensureUnique(
  tx: TenantTx,
  email: string,
  phone?: string,
  allowUserId?: string,
) {
  const conflict = await tx.user.findFirst({
    where: {
      OR: [{ email }, ...(phone ? [{ phone }] : [])],
      ...(allowUserId ? { id: { not: allowUserId } } : {}),
    },
    select: { status: true },
  });
  if (!conflict) return;
  if (conflict.status === "shell") {
    throw new ConflictError(
      "This email or phone is registered at a centre — use the link or code the centre sent you",
    );
  }
  throw new ConflictError("Email or phone already in use");
}

/**
 * The one in-register merge door. The code names exactly one invited shell; a
 * code that names an active account, a non-student, or nothing is refused with
 * the same message `claimTempStudent` uses, so a probe learns nothing about
 * which of the three it hit.
 */
async function shellForInviteCode(tx: TenantTx, inviteCode: string) {
  const invited = await tx.studentProfile.findUnique({
    where: { inviteCode },
    select: { userId: true, entityType: true },
  });
  const shell = invited?.userId
    ? await tx.user.findFirst({ where: { id: invited.userId, status: "shell" } })
    : null;
  if (!shell || invited?.entityType !== "invited") {
    throw new BusinessRuleError("This invite code is not claimable");
  }
  if (shell.role !== "student") {
    throw new ConflictError("Shell exists for this contact with a different role");
  }
  return shell;
}

export async function registerStudent(input: StudentInput) {
  const email = input.email.toLowerCase().trim();
  const phone = input.phone?.trim() || undefined;
  const passwordHash = await hashPassword(input.password);

  const user = await platformDb(async (tx) => {
    const shell = input.inviteCode ? await shellForInviteCode(tx, input.inviteCode) : null;
    await ensureUnique(tx, email, phone, shell?.id);

    let user;
    if (shell) {
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
        // Single use: the code that just merged this shell must not merge it
        // (or anything) again.
        inviteCode: null,
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
    await ensureUnique(tx, email, phone);

    const user = await tx.user.create({
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

export async function registerTeacher(input: TeacherInput) {
  const email = input.email.toLowerCase().trim();
  const phone = input.phone?.trim() || undefined;
  const passwordHash = await hashPassword(input.password);

  const user = await platformDb(async (tx) => {
    // An external (off-system) teacher is a `shell` too (docs/decisions/
    // external-teachers.md); the centre enrols them through the teacher invite
    // token, never by them registering with the email the centre typed.
    await ensureUnique(tx, email, phone);

    const user = await tx.user.create({
      data: {
        email,
        phone,
        passwordHash,
        role: "teacher",
        name: input.name,
        locale: input.locale ?? "ar",
        status: "pending",
      },
    });

    await tx.teacherProfile.upsert({
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

  return platformDb(async (tx) => {
    await ensureUnique(tx, email);
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
        status: "pending",
        receiptSeq: 0,
      },
    });

    const user = await tx.user.create({
      data: {
        email,
        passwordHash,
        role: "center_admin",
        name: input.admin.name,
        locale: input.admin.locale ?? "ar",
        status: "pending",
      },
    });

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
