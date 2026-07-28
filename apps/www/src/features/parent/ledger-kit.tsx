// PROMOTED — these now live in `@repo/ui/components/ledger`.
//
// They moved the moment the shared feature folders (attendance, notifications,
// settings, messaging) needed them: a surface rendered by six portals cannot
// import from one portal's folder.
//
// This file is a re-export shim so that no call site had to change — a
// promotion that forces call sites to change is a promotion done wrong. New
// code should import from `@repo/ui/components/ledger` directly, and this shim
// disappears once the parent screens are re-pointed.
export {
  Figure,
  LimitNote,
  LoadError,
  Metric,
  Money,
  SectionHead,
  SkeletonRows,
  TotalLine,
} from "@repo/ui/components/ledger";
