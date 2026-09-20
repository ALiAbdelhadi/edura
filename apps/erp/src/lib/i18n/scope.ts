import en from "@/messages/en.json";
import { createMessageScope } from "@repo/client-core/i18n/scope";
import { PORTAL_NAMESPACES, type PortalName } from "./portal-namespaces";

const scope = createMessageScope(en);
export const baseMessages = scope.baseMessages;
export const onboardingMessages = scope.withNamespaces("onboarding");
export const portalMessages = (portal: PortalName) =>
  scope.withNamespaces(...PORTAL_NAMESPACES[portal]);
