import nextApp from "@repo/eslint-config/next-app";

const eslintConfig = [
  ...nextApp,
  {
    ignores: [".next/**", "node_modules/**", "public/**"],
  },
];

export default eslintConfig;
