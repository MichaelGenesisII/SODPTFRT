import type { UIMessage } from "ai";
import {
  ASSISTANT_MAX_MESSAGES,
  ASSISTANT_MAX_USER_CHARS,
} from "@/lib/assistant/config";

export function messageText(message: UIMessage): string {
  return message.parts
    .filter((part): part is { type: "text"; text: string } => part.type === "text")
    .map((part) => part.text)
    .join("");
}

export function validateAssistantMessages(messages: UIMessage[]): string | null {
  if (!Array.isArray(messages) || messages.length === 0) {
    return "Please enter a message.";
  }

  if (messages.length > ASSISTANT_MAX_MESSAGES) {
    return "This conversation is too long. Please start a new chat.";
  }

  const lastUser = [...messages].reverse().find((message) => message.role === "user");
  if (!lastUser) {
    return "Please enter a message.";
  }

  const text = messageText(lastUser).trim();
  if (!text) return "Please enter a message.";
  if (text.length > ASSISTANT_MAX_USER_CHARS) {
    return "Your message is too long. Please shorten it.";
  }

  return null;
}
