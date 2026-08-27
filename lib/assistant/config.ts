export function assistantEnabled(): boolean {
  if (process.env.ASSISTANT_ENABLED === "false") return false;
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

export function assistantModelId(): string {
  return process.env.ASSISTANT_MODEL?.trim() || "gpt-4o-mini";
}

export const ASSISTANT_MAX_USER_CHARS = 2000;
export const ASSISTANT_MAX_MESSAGES = 24;
