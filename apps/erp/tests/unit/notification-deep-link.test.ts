import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  NOTIFICATION_DESTINATIONS,
  NOTIFICATION_PORTALS,
  notificationPath,
  notificationUrlForRole,
  portalForRole,
  type NotificationPortal,
} from "@repo/server-core/services/notifications/deep-link";

const DASHBOARD = join(process.cwd(), "src/app/[locale]/dashboard");
const SCHEMA = join(
  process.cwd(),
  "../../packages/database/prisma/schema.prisma",
);

/** The route segments that actually exist under a portal, read off disk. */
function routesOf(portal: NotificationPortal): Set<string> {
  const dir = join(DASHBOARD, portal);
  return new Set(
    readdirSync(dir).filter((entry) =>
      statSync(join(dir, entry)).isDirectory(),
    ),
  );
}

function notificationTypes(): string[] {
  const schema = readFileSync(SCHEMA, "utf8");
  const block = schema.match(/enum NotificationType \{([\s\S]*?)\n\}/);
  if (!block) throw new Error("NotificationType enum not found in schema.prisma");
  return block[1]
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("//") && !line.startsWith("@@"));
}

describe("notification deep links", () => {
  it("has a portal folder for every portal it names", () => {
    for (const portal of NOTIFICATION_PORTALS) {
      expect(existsSync(join(DASHBOARD, portal)), portal).toBe(true);
    }
  });

  /**
   * THE POINT OF THIS FILE. Every destination is checked against the routes
   * that exist on disk, because the failure mode is invisible in review: the
   * previous map sent a parent's grade notification to /dashboard/parent/grades
   * and a teacher's cancelled lesson to /dashboard/teacher/schedule, and both
   * of those are 404s — one map, six portals that do not share a page layout.
   */
  it("points every destination at a route that exists", () => {
    const missing: string[] = [];
    for (const [type, destinations] of Object.entries(
      NOTIFICATION_DESTINATIONS,
    )) {
      for (const [portal, suffix] of Object.entries(destinations)) {
        const segment = suffix.replace(/^\//, "").split("/")[0];
        if (!routesOf(portal as NotificationPortal).has(segment)) {
          missing.push(`${type} -> /dashboard/${portal}${suffix}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it("accounts for every NotificationType in the schema", () => {
    const types = notificationTypes();
    expect(types.length).toBeGreaterThan(30);
    const unaccounted = types.filter(
      (t) => !(t in NOTIFICATION_DESTINATIONS),
    );
    expect(unaccounted).toEqual([]);
  });

  it("names no type the schema does not have", () => {
    // `grade_posted` used to be a case in the screen's switch and has never
    // been a NotificationType — a branch that could not fire.
    const types = new Set(notificationTypes());
    const invented = Object.keys(NOTIFICATION_DESTINATIONS).filter(
      (t) => !types.has(t),
    );
    expect(invented).toEqual([]);
  });

  it("maps each www role to its own portal, and the back office to none", () => {
    expect(portalForRole("student")).toBe("student");
    expect(portalForRole("parent")).toBe("parent");
    expect(portalForRole("teacher")).toBe("teacher");
    expect(portalForRole("assistant")).toBe("assistant");
    expect(portalForRole("center_admin")).toBe("admin");
    expect(portalForRole("center_staff")).toBe("staff");
    // These two sign into apps/superadmin; a link into a www portal would be a
    // link they cannot open.
    expect(portalForRole("super_admin")).toBeNull();
    expect(portalForRole("accountant")).toBeNull();
    expect(portalForRole(null)).toBeNull();
    expect(portalForRole("nonsense")).toBeNull();
  });

  it("sends the same type to different pages for different portals", () => {
    expect(notificationPath("grade_entered", "student")).toBe(
      "/dashboard/student/grades",
    );
    expect(notificationPath("grade_entered", "parent")).toBe(
      "/dashboard/parent/progress",
    );
    expect(notificationPath("payment_recorded", "student")).toBe(
      "/dashboard/student/wallet",
    );
    expect(notificationPath("payment_recorded", "parent")).toBe(
      "/dashboard/parent/fees",
    );
  });

  it("returns no link rather than a wrong one", () => {
    // A teacher has no /materials-less portal problem here — a parent simply
    // has no materials page, so the notification stays a readable line.
    expect(notificationPath("material_uploaded", "parent")).toBeNull();
    expect(notificationPath("admin_broadcast", "student")).toBeNull();
    expect(notificationPath("grade_entered", null)).toBeNull();
    expect(notificationPath("not_a_type", "student")).toBeNull();
  });

  /**
   * The push URL carries the RECIPIENT's locale. A locale-less path does
   * resolve — next-intl's proxy 307s it — but to the locale the request
   * negotiates, i.e. whatever the phone asks for, rather than the language this
   * person chose; and it costs a redirect on a cold open.
   */
  it("prefixes the push URL with the recipient's locale", () => {
    expect(notificationUrlForRole("absence_marked", "student", "ar")).toBe(
      "/ar/dashboard/student/attendance",
    );
    expect(notificationUrlForRole("absence_marked", "student", "en")).toBe(
      "/en/dashboard/student/attendance",
    );
    // Arabic is the product's default, and an unknown locale must not produce
    // a two-segment path that resolves to nothing.
    expect(notificationUrlForRole("absence_marked", "student", null)).toBe(
      "/ar/dashboard/student/attendance",
    );
    expect(notificationUrlForRole("absence_marked", "super_admin", "ar")).toBeNull();
  });

  it("routes a chat push to the messages page of every portal", () => {
    for (const portal of NOTIFICATION_PORTALS) {
      expect(notificationPath("new_chat_message", portal), portal).toBe(
        `/dashboard/${portal}/messages`,
      );
    }
  });
});
