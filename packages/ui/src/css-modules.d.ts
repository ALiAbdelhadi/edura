/**
 * CSS Modules, for tsc.
 *
 * `next-env.d.ts` supplies this inside a Next app, which is why nothing here
 * needed it until a component with its own stylesheet was promoted into the
 * package (`student-id-card.module.css`, 2026-08-09). This package is
 * type-checked by plain `tsc`, which knows nothing about CSS imports.
 *
 * Typed as a string map rather than with generated per-file keys: a build step
 * that generates exact class names would fail the check in CI whenever someone
 * edited a stylesheet without re-running it, which trades a real class of typo
 * for a much more frequent false alarm.
 */
declare module "*.module.css" {
  const classes: Readonly<Record<string, string>>;
  export default classes;
}
