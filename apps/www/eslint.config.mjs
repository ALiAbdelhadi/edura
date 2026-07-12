import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const eslintConfig = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": "warn",
      "@typescript-eslint/no-empty-object-type": "warn",
      // React Compiler readiness rules, new in this eslint-config-next major.
      // Real signal on pre-existing render/effect timing, but fixing each one
      // means reviewing component behavior case-by-case — not a blind
      // dependency-bump edit. Advisory for now, same as the rules above.
      "react-hooks/immutability": "warn",
      "react-hooks/set-state-in-effect": "warn",
    },
  },
  {
    ignores: [".next/**", "node_modules/**", "scratch.js"],
  },
];

export default eslintConfig;
