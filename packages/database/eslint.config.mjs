import { config } from "@repo/eslint-config/base";

/** @type {import("eslint").Linter.Config[]} */
export default [
  { ignores: ["src/generated/**", "prisma/migrations/**"] },
  ...config,
];
