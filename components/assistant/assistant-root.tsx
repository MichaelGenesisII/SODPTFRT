import { AssistantHost } from "@/components/assistant/assistant-host";
import { assistantEnabled } from "@/lib/assistant/config";

export function AssistantRoot() {
  if (!assistantEnabled()) return null;
  return <AssistantHost />;
}
