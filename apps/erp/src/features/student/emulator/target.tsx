/**
 * Re-export shim. The implementation moved to `@/features/emulator/target` when
 * the teacher emulator was built and needed the same control contract; every
 * import path here stays valid and behaviour is unchanged.
 */
export { EmuTarget, EmuTargetProvider } from "@/features/emulator/target";
