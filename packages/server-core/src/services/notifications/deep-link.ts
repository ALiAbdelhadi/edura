import { PORTAL_SEGMENTS, portalSegmentForRole, type PortalSegment } from "../../auth/login-policy";

/** The notification portals ARE the portal segments — one list, in `login-policy`. */
export const NOTIFICATION_PORTALS = PORTAL_SEGMENTS;

export type NotificationPortal = PortalSegment;

type Destinations = Partial<Record<NotificationPortal, string>>;

const DESTINATIONS: Record<string, Destinations> = {
  absence_marked: {
    student: "/attendance",
    parent: "/attendance",
    teacher: "/attendance",
    assistant: "/attendance",
  },
  attendance_corrected: {
    student: "/attendance",
    parent: "/attendance",
    teacher: "/attendance",
    assistant: "/attendance",
  },
  session_cancelled: {
    student: "/schedule",
    teacher: "/classes",
    assistant: "/classes",
    admin: "/schedule",
  },
  session_postponed: {
    student: "/schedule",
    teacher: "/classes",
    assistant: "/classes",
    admin: "/schedule",
  },
  course_cancelled: {
    student: "/subjects",
    teacher: "/classes",
    assistant: "/classes",
    admin: "/classes",
  },
  grade_entered: {
    student: "/grades",
    parent: "/progress",
    teacher: "/grades",
    assistant: "/grades",
  },
  material_uploaded: {
    student: "/materials",
    teacher: "/materials",
    assistant: "/materials",
  },
  payment_recorded: {
    student: "/wallet",
    parent: "/fees",
    teacher: "/wallet",
    admin: "/fees",
    staff: "/finance",
  },
  payment_refunded: {
    student: "/wallet",
    parent: "/fees",
    teacher: "/wallet",
    admin: "/fees",
    staff: "/finance",
  },
  enrollment_request_submitted: {
    teacher: "/classes",
    assistant: "/classes",
    admin: "/enrollment-requests",
  },
  enrollment_request_approved: {
    student: "/courses",
    parent: "/children",
    teacher: "/classes",
    assistant: "/classes",
    admin: "/enrollment-requests",
  },
  enrollment_request_declined: {
    student: "/courses",
    parent: "/children",
    teacher: "/classes",
    assistant: "/classes",
    admin: "/enrollment-requests",
  },
  student_added_to_roster: {
    student: "/subjects",
    teacher: "/classes",
    assistant: "/classes",
    admin: "/students",
    staff: "/students",
  },
  teacher_invited: { admin: "/teachers" },
  parent_link_requested: { student: "/family", parent: "/children" },
  enrollment_restored_over_capacity: {
    teacher: "/classes",
    assistant: "/classes",
    admin: "/classes",
  },
  payout_approved: {
    teacher: "/wallet",
    admin: "/fees",
    staff: "/finance",
  },
  payout_paid: {
    teacher: "/wallet",
    admin: "/fees",
    staff: "/finance",
  },
  classroom_request: {
    teacher: "/centers",
    assistant: "/collaborations",
    admin: "/teachers",
    staff: "/collaborations",
  },
  classroom_request_decided: {
    teacher: "/centers",
    assistant: "/collaborations",
    admin: "/teachers",
    staff: "/collaborations",
  },
  lesson_reminder: {
    student: "/schedule",
    teacher: "/classes",
    assistant: "/classes",
  },
  subscription_expiring: {
    student: "/subscriptions",
    parent: "/subscriptions",
  },
  homework_deadline: { student: "/subjects" },
  guardian_contact_required: {
    student: "/settings",
    parent: "/children",
    admin: "/students",
  },
  new_chat_message: {
    student: "/messages",
    parent: "/messages",
    teacher: "/messages",
    assistant: "/messages",
    admin: "/messages",
    staff: "/messages",
  },
  chat_group_message: {
    student: "/messages",
    parent: "/messages",
    teacher: "/messages",
    assistant: "/messages",
    admin: "/messages",
    staff: "/messages",
  },
  team_note_created: {
    teacher: "/notes",
    assistant: "/notes",
    admin: "/notes",
    staff: "/notes",
  },
  team_note_status_changed: {
    teacher: "/notes",
    assistant: "/notes",
    admin: "/notes",
    staff: "/notes",
  },

  admin_broadcast: {},
  password_reset_requested: {},
  shell_activation_invite: {},
  registration_approved: {},
  registration_rejected: {},
  blacklist_action: {},
  invite_code_sent: {},
  chat_report_filed: {},
};

export function portalForRole(
  role: string | null | undefined,
): NotificationPortal | null {
  return portalSegmentForRole(role);
}

export function notificationPath(
  type: string,
  portal: NotificationPortal | null,
): string | null {
  if (!portal) return null;
  const suffix = DESTINATIONS[type]?.[portal];
  return suffix ? `/dashboard/${portal}${suffix}` : null;
}

export function notificationUrlForRole(
  type: string,
  role: string | null | undefined,
  locale: string | null | undefined,
): string | null {
  const path = notificationPath(type, portalForRole(role));
  if (!path) return null;
  return `/${locale === "en" ? "en" : "ar"}${path}`;
}

export const NOTIFICATION_DESTINATIONS = DESTINATIONS;
