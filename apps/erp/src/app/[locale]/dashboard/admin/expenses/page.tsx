import { AdminExpensesScreen } from "@/features/admin/admin-expenses-screen";
import { localizedTitle } from "@/lib/i18n/page-metadata";

export const generateMetadata = localizedTitle("expenses");

export default function Page() {
  return <AdminExpensesScreen />;
}
