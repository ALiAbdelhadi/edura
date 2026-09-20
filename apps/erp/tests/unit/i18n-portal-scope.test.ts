import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  PORTALS,
  baseNamespaces,
  computePortalScopes,
  loadDict,
} from "../../../../scripts/i18n-portal-scope";
import { PORTAL_NAMESPACES } from "../../src/lib/i18n/portal-namespaces";

// A namespace missing from a portal's list does not throw at runtime -- it prints
// a raw key on the screen. This test is what stands between a new
// `useTranslations("x")` in a portal and an operator reading "x.title".

const scopes = computePortalScopes();
const DASHBOARD = path.resolve(__dirname, "../../src/app/[locale]/dashboard");

describe("per-portal translation scope", () => {
  it("covers exactly the six portals that exist", () => {
    const dirs = fs
      .readdirSync(DASHBOARD, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort();
    expect(dirs).toEqual([...PORTALS].sort());
    expect(Object.keys(PORTAL_NAMESPACES).sort()).toEqual([...PORTALS].sort());
  });

  for (const portal of PORTALS) {
    it(`${portal}: every namespace its code can reach is declared`, () => {
      const declared = new Set<string>(PORTAL_NAMESPACES[portal]);
      const missing = scopes[portal].namespaces.filter((ns) => !declared.has(ns));
      expect(
        missing,
        `add ${JSON.stringify(missing)} to PORTAL_NAMESPACES.${portal} ` +
          `(src/lib/i18n/portal-namespaces.ts). To see which file needs it: ` +
          `bun run scripts/i18n-portal-scope.ts --why ${portal} <namespace>`,
      ).toEqual([]);
    });

    it(`${portal}: its layout mounts <PortalIntl portal="${portal}">`, () => {
      const layout = fs.readFileSync(path.join(DASHBOARD, portal, "layout.tsx"), "utf8");
      expect(layout).toContain(`<PortalIntl portal="${portal}">`);
    });
  }

  it("declares no namespace that does not exist, and none that the base already carries", () => {
    const all = new Set(Object.keys(loadDict("en")));
    const base = new Set(baseNamespaces());
    for (const portal of PORTALS) {
      for (const ns of PORTAL_NAMESPACES[portal]) {
        expect(all.has(ns), `${portal}: "${ns}" is not a namespace in the dictionary`).toBe(true);
        expect(base.has(ns), `${portal}: "${ns}" is already in the base set`).toBe(false);
      }
    }
  });

  it("the import walk is not silently truncated inside our own code", () => {
    for (const portal of PORTALS) {
      const ours = scopes[portal].unresolved.filter((u) => !u.includes("packages/database/src/generated/"));
      expect(ours, `${portal}: imports the walk could not follow`).toEqual([]);
      expect(scopes[portal].files).toBeGreaterThan(100);
    }
  });

  it("the settings screen every portal mounts imports no role-specific card", () => {
    // Anything this file imports reaches all six portals. The role cards arrive
    // through the `roleCards` slot from features/settings/portal-settings/<portal>.
    const screen = fs.readFileSync(
      path.resolve(__dirname, "../../src/features/settings/settings-screen.tsx"),
      "utf8",
    );
    for (const card of [
      "attendance-mode-card",
      "center-profile-card",
      "public-handle-card",
      "profile-image-card",
      "children-guardian-cards",
      "guardian-contact-card",
      "student-id-settings-card",
    ]) {
      expect(screen, `settings-screen.tsx must not import ${card}`).not.toContain(card);
    }
  });

  it("no portal is sent another portal's strings", () => {
    const foreign: Record<string, string[]> = {
      student: ["teacher", "assistant", "adminHome", "adminManage", "onboarding", "centerProfile"],
      parent: ["teacher", "assistant", "adminHome", "adminManage", "onboarding", "centerProfile"],
      teacher: ["adminHome", "adminManage", "assistant"],
      staff: ["teacher", "assistant"],
    };
    for (const [portal, banned] of Object.entries(foreign)) {
      const got = new Set(scopes[portal as keyof typeof scopes].namespaces);
      expect(banned.filter((ns) => got.has(ns)), `${portal} can reach`).toEqual([]);
    }
  });

  it("the shared dashboard layout no longer ships the whole dictionary", () => {
    const layout = fs.readFileSync(path.join(DASHBOARD, "layout.tsx"), "utf8");
    expect(layout).not.toContain("NextIntlClientProvider");
  });

  it("actually shrinks what a portal receives", () => {
    const ar = loadDict("ar");
    const size = (keys: Iterable<string>) =>
      [...keys].reduce((n, k) => n + JSON.stringify(ar[k] ?? "").length, 0);
    const whole = size(Object.keys(ar));
    for (const portal of PORTALS) {
      const sent = size(new Set([...baseNamespaces(), ...PORTAL_NAMESPACES[portal]]));
      expect(sent, `${portal} receives ${sent} of ${whole} chars`).toBeLessThan(whole * 0.75);
    }
  });
});
