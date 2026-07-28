import { platformDb } from "../../db/scope";
import { Prisma, type NotificationType } from "@repo/database";
import { sendMail } from "../../mail/send";
import { pushToUser } from "../fcm/fcm-channel";
import { webPushToUser } from "../webpush/web-push-channel";
import { smsToUser } from "../sms/sms-channel";

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

type Channels = { inapp: boolean; fcm: boolean; email: boolean; sms: boolean };
const C = (
  inapp: boolean,
  fcm: boolean,
  email: boolean,
  sms: boolean,
): Channels => ({ inapp, fcm, email, sms });

const CHANNEL_MATRIX: Record<NotificationType, Channels> = {
  absence_marked: C(true, true, false, false),
  attendance_corrected: C(true, true, false, false),
  session_cancelled: C(true, true, false, true),
  session_postponed: C(true, true, false, false),
  course_cancelled: C(true, true, false, true),
  grade_entered: C(true, true, false, false),
  material_uploaded: C(true, true, false, false),
  payment_recorded: C(true, true, false, false),
  payment_refunded: C(true, true, false, false),
  enrollment_request_submitted: C(true, false, false, false),
  enrollment_request_approved: C(true, true, false, false),
  enrollment_request_declined: C(true, true, false, false),
  student_added_to_roster: C(true, false, false, false),
  teacher_invited: C(true, false, true, false),
  parent_link_requested: C(true, false, true, false),
  admin_broadcast: C(true, true, false, false),
  password_reset_requested: C(false, false, true, false),
  shell_activation_invite: C(false, false, true, false),
  registration_approved: C(true, true, true, false),
  registration_rejected: C(true, false, true, false),
  blacklist_action: C(true, true, true, false),
  // H-04: operational heads-up to the course owner (a lifted blacklist put a
  // student back into a now-full course). In-app + push; no email/SMS noise.
  enrollment_restored_over_capacity: C(true, true, false, false),
  payout_approved: C(true, true, true, false),
  classroom_request: C(true, true, false, false),
  classroom_request_decided: C(true, true, false, false),
  lesson_reminder: C(true, true, false, false),
  homework_deadline: C(true, true, false, false),
  invite_code_sent: C(false, false, false, true),
  // Child safety escalation. In-app + push only: the whole point is that we do
  // NOT yet have a guardian email to write to, and the student's own inbox is
  // the channel this rule exists to avoid using.
  guardian_contact_required: C(true, true, false, false),
  new_chat_message: C(true, true, false, false),
  chat_group_message: C(true, true, false, false),
  // Safety escalation — in-app + push to the reviewing staff, never SMS/email
  // (report details can contain a minor's own words; keep them in-platform).
  chat_report_filed: C(true, true, false, false),
  // Team notes: internal team coordination (center staff / teacher's
  // assistants). In-app + push only — never email/SMS noise.
  team_note_created: C(true, true, false, false),
  team_note_status_changed: C(true, true, false, false),
};

export async function notify(
  input: NotifyInput,
  email?: EmailPayload,
): Promise<void> {
  const ch = CHANNEL_MATRIX[input.type] ?? C(true, false, false, false);
  const recipients = input.recipients.filter(Boolean);
  if (recipients.length === 0 && !email) return;

  const enabledChannels = [
    ch.fcm && "fcm",
    ch.fcm && "webpush",
    ch.email && "email",
    ch.sms && "sms",
  ].filter(Boolean) as string[];

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

  let contacts: { id: string; email: string | null; phone: string | null }[] =
    [];
  if ((ch.email || ch.sms) && recipients.length > 0) {
    contacts = await platformDb((tx) =>
      tx.user.findMany({
        where: { id: { in: recipients } },
        select: { id: true, email: true, phone: true },
      }),
    );
  }

  if (ch.email) {
    if (email) {
      await sendMail({
        to: email.to,
        subject: email.subject,
        text: email.text,
      }).catch(() => {});
    } else {
      await Promise.all(
        contacts
          .filter((u) => u.email)
          .map((u) =>
            sendMail({
              to: u.email as string,
              subject: input.title,
              text: input.body,
            }).catch(() => {}),
          ),
      );
    }
  }

  if (ch.sms) {
    await Promise.all(
      contacts.map((u) => smsToUser(u.phone, `${input.title}: ${input.body}`)),
    );
  }

  if (ch.fcm && recipients.length > 0) {
    const fcmData: Record<string, string> = { type: input.type };
    if (input.data) {
      for (const [k, v] of Object.entries(input.data)) fcmData[k] = String(v);
    }
    await Promise.all([
      ...recipients.map((uid) =>
        pushToUser(uid.toString(), {
          title: input.title,
          body: input.body,
          data: fcmData,
        }).catch(() => {}),
      ),
      ...recipients.map((uid) =>
        webPushToUser(uid.toString(), {
          title: input.title,
          body: input.body,
          data: fcmData,
        }).catch(() => {}),
      ),
    ]);
  }
}
