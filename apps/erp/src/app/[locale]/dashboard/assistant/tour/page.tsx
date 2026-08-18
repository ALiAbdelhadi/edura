import { AssistantEmulator } from "@/features/assistant/emulator/assistant-emulator";

/**
 * The permanent way back into the assistant's guided tour — same reasoning as
 * every other portal's: the first-run gate decides when the emulator opens
 * ITSELF, never whether it exists. An assistant hired in October reaches it
 * here, with no flag to reset and nothing to ask their teacher for.
 */
export default function Page() {
  return <AssistantEmulator />;
}
