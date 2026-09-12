export type TemplateOverride = {
  subject?: string;
  html?: string;
  text?: string;
};

export function mergeTemplateOverride(
  built: { subject: string; text: string; html: string },
  override?: TemplateOverride | null,
) {
  if (!override) return built;
  return {
    subject: override.subject?.trim() || built.subject,
    html: override.html?.trim() || built.html,
    text: override.text?.trim() || built.text,
  };
}
