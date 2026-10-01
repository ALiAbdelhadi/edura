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
    // Backend separation: apps/erp is frontend-only. Server code lives in
    // apps/api and is reached over HTTP (src/lib/server/service-fetch.ts).
    // Type-only imports are erased (isolatedModules), so they stay allowed.
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
                "Server code lives in apps/api; call it through service-fetch or move pure helpers to @repo/shared.",
            },
            {
              // Bare names as a regex: a gitignore group "api" matches ANY path
              // segment named api, which would flag "@/lib/api/client".
              regex: "^(api|ioredis|bcryptjs|jose|nodemailer)(/.*)?$",
              allowTypeImports: true,
              message:
                "Server code lives in apps/api; call it through service-fetch or move pure helpers to @repo/shared.",
            },
            {
              // A regex, not a gitignore group: "!better-auth/react" cannot
              // re-include a path whose parent "better-auth" is already matched.
              regex: "^better-auth(?!/react$|/client/plugins$)(/.*)?$",
              allowTypeImports: true,
              message: "Only the better-auth client is allowed.",
            },
          ],
        },
      ],
    },
  },
  {
    ignores: [".next/**", ".next-*/**", "node_modules/**", "scratch.js", "public/sw.js"],
  },
];

export default eslintConfig;
