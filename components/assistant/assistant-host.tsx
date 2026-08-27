"use client";

import { usePathname } from "next/navigation";
import { AssistantWidget } from "@/components/assistant/assistant-widget";
import { assistantVisibleOnPath } from "@/lib/assistant/routes";

export function AssistantHost() {
  const pathname = usePathname() ?? "";

  if (!assistantVisibleOnPath(pathname)) {
    return null;
  }

  return <AssistantWidget />;
}
