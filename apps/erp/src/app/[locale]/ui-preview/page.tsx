import { UiPreviewScreen } from "@/features/dev/ui-preview-screen";
import { notFound } from "next/navigation";

export default function UiPreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <UiPreviewScreen />;
}
