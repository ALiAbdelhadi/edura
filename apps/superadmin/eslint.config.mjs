import nextApp from "@repo/eslint-config/next-app";

const eslintConfig = [
  ...nextApp,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": "warn",
      "@typescript-eslint/no-empty-object-type": "warn",
      "react-hooks/immutability": "warn",
      "react-hooks/set-state-in-effect": "warn",
    },
  },
  {
    // Phase 5 (docs/decisions/backend-separation.md): the back office is a
    // frontend. Nothing under src/ may VALUE-import a server package — the
    // service owns every route, the DB, mail and the auth instance. Type
    // imports stay allowed (the auth client infers its fields from AdminAuth;
    // SessionUser shapes props). Same rule as apps/erp, with apps/admin-api in
    // place of apps/api.
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": "off",
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "@repo/server-core",
                "@repo/server-core/*",
                "@repo/database",
                "@repo/database/*",
                "@repo/notifications",
                "@repo/notifications/*",
                "@prisma/*",
                "@sentry/node",
              ],
              allowTypeImports: true,
              message:
                "apps/superadmin is frontend-only (phase 5). Server packages are value-imported only in apps/admin-api; `import type` is fine.",
            },
            {
              regex: "^(api|admin-api|ioredis|bcryptjs|jose|nodemailer)(/.*)?$",
              allowTypeImports: true,
              message: "Server-only module: it belongs to apps/admin-api. Reach it over HTTP (ky client or service-fetch).",
            },
            {
              regex: "^better-auth(?!/react$|/client/plugins$)(/.*)?$",
              allowTypeImports: true,
              message:
                "Only better-auth/react and better-auth/client/plugins are browser-safe; the server instance lives in apps/admin-api.",
            },
          ],
        },
      ],
    },
  },
  {
    ignores: [".next/**", ".next-*/**", "node_modules/**", "scratch.js"],
  },
];

export default eslintConfig;
