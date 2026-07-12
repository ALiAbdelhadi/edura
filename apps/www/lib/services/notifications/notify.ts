import { platformDb } from "@/lib/db/scope";
import { Prisma, type NotificationType } from "@repo/database";
import { sendMail } from "@/lib/mail/send";
import { FCM_PUSH_TYPES, pushToUser } from "@/lib/services/fcm/fcmChannel";

type NotifyInput = {
  recipients: string[];
  type: NotificationType;
  title: string;
  body: string;
  data?: Record<string, unknown>;
};

// Email-only types: no in-app row written
const EMAIL_ONLY_TYPES: NotificationType[] = [
  "password_reset_requested",
  "shell_activation_invite",
];

// Types that also send email
const EMAIL_TYPES: NotificationType[] = [
  "teacher_invited",
  "parent_link_requested",
  "password_reset_requested",
  "shell_activation_invite",
];

type EmailPayload = {
  to: string;
  subject: string;
  text: string;
};

export async function notify(input: NotifyInput, email?: EmailPayload): Promise<void> {
  const isEmailOnly = EMAIL_ONLY_TYPES.includes(input.type);

  // DB work runs inside a single platform-context transaction; external side
  // effects (email, FCM) fire AFTER it closes.
  if (!isEmailOnly && input.recipients.length > 0) {
    const docs = input.recipients.map((userId) => ({
      userId: userId.toString(),
      type: input.type,
      title: input.title,
      body: input.body,
      data: (input.data ?? {}) as Prisma.InputJsonValue,
      read: false,
    }));
    await platformDb((tx) => tx.notification.createMany({ data: docs }));
  }

  if (EMAIL_TYPES.includes(input.type) && email) {
    await sendMail({ to: email.to, subject: email.subject, text: email.text }).catch(
      () => {},
    );
  }

  // FCM push for supported types
  if (FCM_PUSH_TYPES.has(input.type) && input.recipients.length > 0) {
    const fcmData: Record<string, string> = { type: input.type };
    if (input.data) {
      for (const [k, v] of Object.entries(input.data)) {
        fcmData[k] = String(v);
      }
    }
    await Promise.all(
      input.recipients.map((uid) =>
        pushToUser(uid.toString(), {
          title: input.title,
          body: input.body,
          data: fcmData,
        }).catch(() => {}),
      ),
    );
  }
}
