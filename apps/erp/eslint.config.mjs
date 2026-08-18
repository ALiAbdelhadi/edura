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
    // `.next-*/**` covers a NEXT_DIST_DIR scratch build; without it a parallel
    // verification build adds ~1,700 lint errors from generated output.
    ignores: [".next/**", ".next-*/**", "node_modules/**", "scratch.js"],
  },
];

export default eslintConfig;
