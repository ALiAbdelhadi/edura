/**
 * Where a notification lands when its recipient opens it — the ONE definition,
 * shared by the in-app list (the notifications screen) and by web push (the URL
 * baked into the payload the service worker opens on click).
 *
 * IT IS KEYED BY PORTAL, NOT ONLY BY TYPE, and that is the whole point. The six
 * www portals do not share a page layout: a grade lands on `/grades` for a
 * student and on `/progress` for a parent, a teacher has no `/schedule` at all,
 * and a center admin has no `/attendance`. The previous map applied ONE suffix
 * to every role, so a parent's grade notification opened
 * `/dashboard/parent/grades` — a route that does not exist. Every destination
 * here is asserted against the real route folders on disk by
 * `tests/unit/notification-deep-link.test.ts`, so a portal that loses a page
 * fails the test rather than shipping a 404 nobody clicks until launch.
 *
 * A MISSING DESTINATION IS AN ANSWER, NOT A GAP. The notification is still
 * delivered and still readable in the list; it simply does not navigate. That
 * is the right outcome for `admin_broadcast` (no target), `blacklist_action`
 * (the message is the content) and `chat_report_filed` (reviewed in the back
 * office, which is a different app).
 *
 * Dependency-free on purpose: a client component imports it, so it must not
 * drag `@repo/database` — and therefore Prisma — into the browser bundle. The
 * type key is a plain string for the same reason; the drift test reads the
 * `NotificationType` enum out of `schema.prisma` and asserts this map accounts
 * for every value.
 */

export const NOTIFICATION_PORTALS = [
  "student",
  "parent",
  "teacher",
  "assistant",
  "admin",
  "staff",
] as const;

export type NotificationPortal = (typeof NOTIFICATION_PORTALS)[number];

type Destinations = Partial<Record<NotificationPortal, string>>;

/** Path suffixes, relative to `/dashboard/<portal>`. */
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
    // The parent portal calls this "progress"; it has no /grades route.
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

  // Deliberately destination-less — see the header. Listed explicitly so the
  // drift test can tell "decided: nowhere to go" from "nobody has looked at
  // this type yet".
  admin_broadcast: {},
  password_reset_requested: {},
  shell_activation_invite: {},
  registration_approved: {},
  registration_rejected: {},
  blacklist_action: {},
  invite_code_sent: {},
  chat_report_filed: {},
};

/**
 * The www portal a role signs into. `null` for the back-office roles: they have
 * no portal in this app, so a notification addressed to one carries no link
 * rather than a link into a portal they cannot open.
 */
export function portalForRole(
  role: string | null | undefined,
): NotificationPortal | null {
  switch (role) {
    case "student":
    case "parent":
    case "teacher":
    case "assistant":
      return role;
    case "center_admin":
      return "admin";
    case "center_staff":
      return "staff";
    default:
      return null;
  }
}

/** Locale-less in-app path, for a router that adds the locale itself. */
export function notificationPath(
  type: string,
  portal: NotificationPortal | null,
): string | null {
  if (!portal) return null;
  const suffix = DESTINATIONS[type]?.[portal];
  return suffix ? `/dashboard/${portal}${suffix}` : null;
}

/**
 * Absolute in-app URL for a push payload, carrying the recipient's own locale.
 *
 * The locale is not decoration. `next-intl`'s proxy does redirect a locale-less
 * `/dashboard/...` (measured: 307 to `/ar/...`), so an unprefixed path would
 * resolve — but it would resolve to whatever locale the REQUEST negotiates,
 * which for a notification means whatever the phone's browser happens to ask
 * for, not the language this person chose. It also costs a redirect on a cold
 * open. We know who we are writing to; say it.
 */
export function notificationUrlForRole(
  type: string,
  role: string | null | undefined,
  locale: string | null | undefined,
): string | null {
  const path = notificationPath(type, portalForRole(role));
  if (!path) return null;
  return `/${locale === "en" ? "en" : "ar"}${path}`;
}

/** Exposed for the drift test only. */
export const NOTIFICATION_DESTINATIONS = DESTINATIONS;
