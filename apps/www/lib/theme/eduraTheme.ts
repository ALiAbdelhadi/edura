import type { ThemeConfig } from "antd";
import { theme as antdTheme } from "antd";

/**
 * Edura design tokens — the single source of truth for the product's look.
 *
 * The app is built on Ant Design 5, so the theme lives here (consumed by
 * ConfigProvider) rather than in Tailwind. Changing a token here cascades to
 * every screen with zero component edits. Keep all visual decisions in this
 * file — never hardcode hex in components.
 *
 * Direction (3 words): Calm · Credible · Clear.
 * Edura handles payments, grades, and minors' data across four roles, so the
 * system leans trust-first and high-legibility over decorative flair, while
 * staying warm enough that students and parents don't feel like they're inside
 * accounting software.
 */

// ── Brand & semantic palette ────────────────────────────────────────────────
// Primary is the client's existing brand hex — preserved exactly, not "improved".
const brand = {
  primary: "#0fa5e9", // Edura sky
  primaryHover: "#38bdf8",
  primaryActive: "#0284c7",
  primaryBg: "#e0f2fe",
  primaryBgHover: "#bae6fd",
} as const;

const semantic = {
  success: "#16a34a",
  successBg: "#dcfce7",
  warning: "#f59e0b",
  warningBg: "#fef3c7",
  error: "#ef4444",
  errorBg: "#fee2e2",
  info: brand.primary,
  infoBg: brand.primaryBg,
} as const;

// ── Neutrals (surfaces, text, borders) ──────────────────────────────────────
const neutral = {
  text: "#1c1c1e",
  textSecondary: "#555a6a",
  textTertiary: "#8b8f9c", // darkened from the legacy #a5a8b5 to clear WCAG AA on white
  textQuaternary: "#b7bac4",
  border: "#e4e6ec",
  borderSecondary: "#eef0f3",
  bgLayout: "#f4f5f7", // app canvas
  bgContainer: "#ffffff", // cards / surfaces
  bgElevated: "#ffffff", // popovers / modals
  fill: "#f2f3f5",
  fillSecondary: "#f6f7f9",
} as const;

// ── Elevation ────────────────────────────────────────────────────────────────
// AntD's default shadows read a little heavy. Softer, layered shadows feel more
// premium and let the border carry structure at rest.
const shadow = {
  card: "0 1px 2px rgba(16,24,40,0.04), 0 1px 3px rgba(16,24,40,0.06)",
  raised:
    "0 4px 6px -2px rgba(16,24,40,0.03), 0 12px 16px -4px rgba(16,24,40,0.08)",
  overlay:
    "0 8px 8px -4px rgba(16,24,40,0.03), 0 20px 24px -4px rgba(16,24,40,0.10)",
} as const;

// Arabic-first stack (PRD: Arabic RTL primary). IBM Plex Sans Arabic leads —
// a neutral, high-legibility grotesque that harmonizes with the Latin display
// face; Noto Sans Arabic is the wide-coverage fallback. Loaded in the layout.
const fontStack =
  "var(--font-plex-arabic), var(--font-noto-sans), 'Noto Sans Arabic', 'Noto Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif";

// ── Dark-mode neutrals (Geist-style: near-black canvas, hairline borders) ─────
const darkNeutral = {
  text: "#f4f4f5",
  textSecondary: "#a1a1aa",
  textTertiary: "#7c7c86",
  textQuaternary: "#52525b",
  border: "#2a2a31",
  borderSecondary: "#232329",
  bgLayout: "#0b0b0d", // app canvas
  bgContainer: "#151518", // cards / surfaces
  bgElevated: "#1c1c21", // popovers / modals
  fill: "#212127",
  fillSecondary: "#1a1a1f",
} as const;

const darkShadow = {
  card: "0 1px 2px rgba(0,0,0,0.30), 0 1px 3px rgba(0,0,0,0.40)",
  raised: "0 4px 6px -2px rgba(0,0,0,0.35), 0 12px 16px -4px rgba(0,0,0,0.50)",
  overlay: "0 8px 8px -4px rgba(0,0,0,0.35), 0 20px 24px -4px rgba(0,0,0,0.55)",
} as const;

export const eduraTheme: ThemeConfig = {
  token: {
    // Color — brand
    colorPrimary: brand.primary,
    colorLink: brand.primary,
    colorLinkHover: brand.primaryHover,
    colorLinkActive: brand.primaryActive,

    // Color — semantic
    colorSuccess: semantic.success,
    colorWarning: semantic.warning,
    colorError: semantic.error,
    colorInfo: semantic.info,

    // Color — text
    colorText: neutral.text,
    colorTextSecondary: neutral.textSecondary,
    colorTextTertiary: neutral.textTertiary,
    colorTextQuaternary: neutral.textQuaternary,

    // Color — surfaces & borders
    colorBgLayout: neutral.bgLayout,
    colorBgContainer: neutral.bgContainer,
    colorBgElevated: neutral.bgElevated,
    colorBorder: neutral.border,
    colorBorderSecondary: neutral.borderSecondary,
    colorFillSecondary: neutral.fill,
    colorFillTertiary: neutral.fillSecondary,

    // Radius — softer, 2026-modern
    borderRadius: 10,
    borderRadiusLG: 16,
    borderRadiusSM: 6,
    borderRadiusXS: 4,

    // Typography
    fontFamily: fontStack,
    fontSize: 14,
    fontSizeHeading1: 30,
    fontSizeHeading2: 24,
    fontSizeHeading3: 19,
    fontSizeHeading4: 16,
    fontSizeLG: 16,
    lineHeight: 1.5715,

    // Sizing — 36px controls are comfortable without wrecking table density;
    // large controls hit the 44px touch target for primary actions on mobile.
    controlHeight: 36,
    controlHeightLG: 44,
    controlHeightSM: 28,

    // Elevation
    boxShadow: shadow.card,
    boxShadowSecondary: shadow.raised,
    boxShadowTertiary: shadow.card,

    // Motion — slightly quicker than default reads as more responsive
    motionDurationMid: "0.18s",
    motionDurationSlow: "0.28s",
    wireframe: false,
  },

  components: {
    Layout: {
      headerBg: neutral.bgContainer,
      headerHeight: 64,
      headerPadding: "0 24px",
      siderBg: neutral.bgContainer,
      bodyBg: neutral.bgLayout,
      footerBg: neutral.bgLayout,
    },
    Menu: {
      itemBg: "transparent",
      subMenuItemBg: "transparent",
      itemBorderRadius: 10,
      itemSelectedBg: brand.primaryBg,
      itemSelectedColor: brand.primaryActive,
      itemActiveBg: neutral.fill,
      itemHoverBg: neutral.fill,
      itemHeight: 42,
      iconSize: 17,
      collapsedIconSize: 18,
      itemMarginInline: 8,
      fontSize: 14,
    },
    Card: {
      borderRadiusLG: 16,
      boxShadowTertiary: shadow.card,
      paddingLG: 24,
      colorBorderSecondary: neutral.border,
      headerFontSize: 16,
      headerFontSizeSM: 14,
    },
    Button: {
      fontWeight: 500,
      primaryShadow: "none", // drop AntD's dated primary-button drop shadow
      defaultShadow: "none",
      dangerShadow: "none",
      controlHeight: 36,
      controlHeightLG: 44,
      borderRadius: 10,
      paddingInline: 18,
    },
    Input: {
      controlHeight: 36,
      controlHeightLG: 44,
      borderRadius: 10,
      activeShadow: `0 0 0 3px ${brand.primaryBg}`,
    },
    Select: {
      controlHeight: 36,
      controlHeightLG: 44,
      borderRadius: 10,
    },
    Table: {
      headerBg: neutral.fillSecondary,
      headerColor: neutral.textSecondary,
      headerSplitColor: "transparent",
      borderColor: neutral.borderSecondary,
      rowHoverBg: neutral.fillSecondary,
      cellPaddingBlock: 14,
      headerBorderRadius: 12,
      fontSize: 14,
    },
    Statistic: {
      // KPI numbers on dashboards — big, confident, on-brand.
      contentFontSize: 30,
      titleFontSize: 13,
    },
    Tag: {
      borderRadiusSM: 8,
      defaultBg: neutral.fill,
      defaultColor: neutral.textSecondary,
    },
    Segmented: {
      borderRadius: 10,
      itemSelectedBg: neutral.bgContainer,
      trackBg: neutral.fill,
    },
    Tabs: {
      titleFontSize: 15,
      horizontalItemPadding: "12px 4px",
      inkBarColor: brand.primary,
    },
    Modal: {
      borderRadiusLG: 18,
      boxShadow: shadow.overlay,
      paddingContentHorizontalLG: 28,
    },
    Drawer: {
      boxShadow: shadow.overlay,
    },
    Progress: {
      defaultColor: brand.primary,
    },
    Badge: {
      textFontSize: 12,
    },
    Avatar: {
      borderRadius: 10,
    },
    Notification: {
      borderRadiusLG: 14,
      boxShadow: shadow.overlay,
    },
    Message: {
      borderRadiusLG: 12,
      contentBg: neutral.bgElevated,
    },
  },
};

/**
 * Dark variant (PRD §0 non-negotiable #5). Built from the light theme: same
 * brand accent, radii, motion, and component structure, but with dark neutrals
 * and Ant Design's darkAlgorithm. Selected by ThemeModeProvider from the user's
 * preference / device `prefers-color-scheme`.
 */
export const eduraDarkTheme: ThemeConfig = {
  ...eduraTheme,
  algorithm: antdTheme.darkAlgorithm,
  token: {
    ...eduraTheme.token,
    colorPrimaryBg: "#0c2733",
    colorPrimaryBgHover: "#123644",
    colorText: darkNeutral.text,
    colorTextSecondary: darkNeutral.textSecondary,
    colorTextTertiary: darkNeutral.textTertiary,
    colorTextQuaternary: darkNeutral.textQuaternary,
    colorBgLayout: darkNeutral.bgLayout,
    colorBgContainer: darkNeutral.bgContainer,
    colorBgElevated: darkNeutral.bgElevated,
    colorBorder: darkNeutral.border,
    colorBorderSecondary: darkNeutral.borderSecondary,
    colorFillSecondary: darkNeutral.fill,
    colorFillTertiary: darkNeutral.fillSecondary,
    boxShadow: darkShadow.card,
    boxShadowSecondary: darkShadow.raised,
    boxShadowTertiary: darkShadow.card,
  },
  components: {
    ...eduraTheme.components,
    Layout: {
      headerBg: darkNeutral.bgContainer,
      headerHeight: 64,
      headerPadding: "0 24px",
      siderBg: darkNeutral.bgContainer,
      bodyBg: darkNeutral.bgLayout,
      footerBg: darkNeutral.bgLayout,
    },
    Menu: {
      ...eduraTheme.components?.Menu,
      itemBg: "transparent",
      subMenuItemBg: "transparent",
      itemSelectedBg: "#0c2733",
      itemSelectedColor: brand.primaryHover,
      itemActiveBg: darkNeutral.fill,
      itemHoverBg: darkNeutral.fill,
    },
    Card: {
      ...eduraTheme.components?.Card,
      colorBorderSecondary: darkNeutral.border,
      boxShadowTertiary: darkShadow.card,
    },
    Table: {
      ...eduraTheme.components?.Table,
      headerBg: darkNeutral.fillSecondary,
      headerColor: darkNeutral.textSecondary,
      borderColor: darkNeutral.borderSecondary,
      rowHoverBg: darkNeutral.fill,
    },
    Tag: {
      ...eduraTheme.components?.Tag,
      defaultBg: darkNeutral.fill,
      defaultColor: darkNeutral.textSecondary,
    },
    Segmented: {
      ...eduraTheme.components?.Segmented,
      itemSelectedBg: darkNeutral.bgElevated,
      trackBg: darkNeutral.fill,
    },
    Modal: { ...eduraTheme.components?.Modal, boxShadow: darkShadow.overlay },
    Drawer: { boxShadow: darkShadow.overlay },
    Notification: { ...eduraTheme.components?.Notification, boxShadow: darkShadow.overlay },
    Message: { ...eduraTheme.components?.Message, contentBg: darkNeutral.bgElevated },
  },
};

/**
 * Per-role accent — an optional, subtle tint so each portal feels like its own
 * space while sharing one system. Wire by wrapping a portal's layout in a
 * ConfigProvider that merges this over eduraTheme. Documented for Phase 2;
 * not enabled by default to keep the launch surface minimal.
 */
export const roleAccent = {
  center_admin: brand.primary, // sky — the operational hub
  teacher: "#7c3aed", // violet — instruction
  student: "#0891b2", // cyan — learning
  parent: "#059669", // emerald — care / oversight
} as const;

export { brand, semantic, neutral, shadow };
