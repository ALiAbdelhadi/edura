import { UiPreviewScreen } from "@/features/dev/ui-preview-screen";
import { notFound } from "next/navigation";

/* The design-token gallery — a development surface, and NOT a public one.
   ══════════════════════════════════════════════════════════════════════════════

   It renders every colour token, every control state and a live toast, behind no
   auth gate at all. That leaks no data, so this is hygiene rather than a
   vulnerability — but it is a page nobody outside this repo has any reason to
   reach, and it was routable in production.

   THE GATE IS HERE, IN A SERVER COMPONENT, and not inside the gallery itself,
   so the decision is made before anything renders. Be precise about what that
   buys, because it is easy to overclaim: the gallery is STILL COMPILED, into its
   own route chunk (`static/chunks/app/[locale]/ui-preview/page-*.js`, verified —
   no shared chunk references it). What the gate does is make production never
   serve the route, so nothing ever requests that chunk. It is unreachable, not
   absent.

   Same shape as `receipt-preview/page.tsx`, which gates the same way. */
export default function UiPreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <UiPreviewScreen />;
}
