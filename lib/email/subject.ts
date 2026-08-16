/** Shared email subject helper — safe for client + server. */
export function defaultTicketEmailSubject(topic: string, reference: string) {
  return `School of Disciples · ${topic} (${reference})`;
}
