import { redirect } from "@/i18n/navigation";
import { getLocale } from "next-intl/server";

export default async function AssistantMessagesPage() {
  redirect({ href: "/dashboard/assistant", locale: await getLocale() });
}
