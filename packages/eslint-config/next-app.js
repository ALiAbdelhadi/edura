import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

/**
 * The exact `eslint-config-next` preset pair the three Next apps used to import
 * directly — re-exported from HERE, and that indirection is the whole point.
 *
 * `eslint-config-next` depends on `typescript-eslint`, whose peer `typescript`
 * resolves from whichever package imports it. The apps run TypeScript 7 (the
 * native compiler), and typescript-eslint refuses to load against it outright:
 *
 *   Error: typescript-eslint does not support TS 7.0.
 *
 * so importing the preset from an app bound the linter to TS 7 and killed every
 * lint run. This package pins `typescript` at 5.9.3, so resolving the preset
 * through it binds the linter to a TypeScript it supports, while every app keeps
 * TypeScript 7 for `tsc`. The rule set is unchanged — this file adds no rule and
 * removes none.
 *
 * Retire this indirection when typescript-eslint supports TS >= 7.1
 * (typescript-eslint#10940); the apps can then import the preset directly again.
 */
const nextAppConfig = [...nextCoreWebVitals, ...nextTypescript];

export default nextAppConfig;
