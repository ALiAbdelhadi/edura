import en from "@/messages/en.json";
import { createMessageScope } from "@repo/client-core/i18n/scope";

const scope = createMessageScope(en);
export const baseMessages = scope.baseMessages;
export const onboardingMessages = scope.withNamespaces("onboarding");
