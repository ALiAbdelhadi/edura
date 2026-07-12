import { platformDb } from "@/lib/db/scope";
import { Prisma, type NotificationType } from "@repo/database";
import { sendMail } from "@/lib/mail/send";
import { pushToUser } from "@/lib/services/fcm/fcmChannel";
import { smsToUser } from "@/lib/services/sms/smsChannel";

type NotifyInput = {
  recipients: string[];
  type: NotificationType;
  title: string;
  body: string;
  data?: Record<string, unknown>;
};

type EmailPayload = {
  to: string;
  subject: string;
  text: string;
};

/**
 * Per-type channel routing — the code encoding of the PRD §6 Notification Matrix.
 *
 *   inapp — write a row to `notifications` (the in-app notification center)
 *   fcm   — push via Firebase (fcmChannel; no-op until FIREBASE_SERVICE_ACCOUNT_JSON)
 *   email — send an email (mail/send; console in dev)
 *   sms   — send an SMS (smsChannel; no-op until SMS_PROVIDER)
 *
 * When a type needs email/sms and the caller passes no explicit payload, a
 * message is derived from title/body and sent to each recipient's email/phone.
 */
type Channels = { inapp: boolean; fcm: boolean; email: boolean; sms: boolean };
const C = (inapp: boolean, fcm: boolean, email: boolean, sms: boolean): Channels => ({ inapp, fcm, email, sms });

const CHANNEL_MATRIX: Record<NotificationType, Channels> = {
  // event                        inapp  fcm    email  sms
  absence_marked:                 C(true,  true,  false, false), // Student absence -> Parent (FCM)
  attendance_corrected:           C(true,  true,  false, false),
  session_cancelled:              C(true,  true,  false, true),  // Lesson cancelled -> students (FCM+SMS)
  session_postponed:              C(true,  true,  false, false),
  course_cancelled:               C(true,  true,  false, true),
  grade_entered:                  C(true,  true,  false, false), // New grade -> Student+Parent (FCM)
  material_uploaded:              C(true,  true,  false, false),
  payment_recorded:               C(true,  true,  false, false), // New payment -> Student+Parent (FCM)
  enrollment_request_submitted:   C(true,  false, false, false),
  enrollment_request_approved:    C(true,  true,  false, false),
  enrollment_request_declined:    C(true,  true,  false, false),
  student_added_to_roster:        C(true,  false, false, false),
  teacher_invited:                C(true,  false, true,  false),
  parent_link_requested:          C(true,  false, true,  false),
  admin_broadcast:                C(true,  true,  false, false),
  password_reset_requested:       C(false, false, true,  false), // email only
  shell_activation_invite:        C(false, false, true,  false), // email only
  registration_approved:          C(true,  true,  true,  false), // Registration approved (FCM+Email)
  registration_rejected:          C(true,  false, true,  false), // Registration rejected (Email w/ reason)
  blacklist_action:               C(true,  true,  true,  false), // Blacklist action (Email+FCM)
  payout_approved:                C(true,  true,  true,  false), // Payout approved (FCM+Email)
  classroom_request:              C(true,  true,  false, false), // Classroom booking request -> Center (FCM)
  classroom_request_decided:      C(true,  true,  false, false), // Request approved/rejected -> Teacher (FCM)
  lesson_reminder:                C(true,  true,  false, false), // Lesson reminder 30min (FCM)
  homework_deadline:              C(true,  true,  false, false), // Homework deadline (FCM)
  invite_code_sent:               C(false, false, false, true),  // Invite code -> temp student (SMS)
  new_chat_message:               C(true,  true,  false, false), // New chat message -> recipient (FCM)
};

export async function notify(input: NotifyInput, email?: EmailPayload): Promise<void> {
  const ch = CHANNEL_MATRIX[input.type] ?? C(true, false, false, false);
  const recipients = input.recipients.filter(Boolean);
  if (recipients.length === 0 && !email) return;

  const enabledChannels = [
    ch.fcm && "fcm",
    ch.email && "email",
    ch.sms && "sms",
  ].filter(Boolean) as string[];

  // 1. In-app rows (single platform transaction; side effects fire after).
  if (ch.inapp && recipients.length > 0) {
    const docs = recipients.map((userId) => ({
      userId: userId.toString(),
      type: input.type,
      title: input.title,
      body: input.body,
      data: (input.data ?? {}) as Prisma.InputJsonValue,
      channels: enabledChannels,
      read: false,
    }));
    await platformDb((tx) => tx.notification.createMany({ data: docs }));
  }

  // Resolve recipient contact info once if email or SMS is needed.
  let contacts: { id: string; email: string | null; phone: string | null }[] = [];
  if ((ch.email || ch.sms) && recipients.length > 0) {
    contacts = await platformDb((tx) =>
      tx.user.findMany({
        where: { id: { in: recipients } },
        select: { id: true, email: true, phone: true },
      }),
    );
  }

  // 2. Email.
  if (ch.email) {
    if (email) {
      await sendMail({ to: email.to, subject: email.subject, text: email.text }).catch(() => {});
    } else {
      await Promise.all(
        contacts
          .filter((u) => u.email)
          .map((u) =>
            sendMail({ to: u.email as string, subject: input.title, text: input.body }).catch(() => {}),
          ),
      );
    }
  }

  // 3. SMS.
  if (ch.sms) {
    await Promise.all(contacts.map((u) => smsToUser(u.phone, `${input.title}: ${input.body}`)));
  }

  // 4. FCM push.
  if (ch.fcm && recipients.length > 0) {
    const fcmData: Record<string, string> = { type: input.type };
    if (input.data) {
      for (const [k, v] of Object.entries(input.data)) fcmData[k] = String(v);
    }
    await Promise.all(
      recipients.map((uid) =>
        pushToUser(uid.toString(), { title: input.title, body: input.body, data: fcmData }).catch(() => {}),
      ),
    );
  }
}
