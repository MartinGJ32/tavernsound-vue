export interface ChatMessage {
  id: string;
  userId: string;
  userName: string;
  text: string;
  sentAt: number;
}

export function isChatMessage(value: unknown): value is ChatMessage {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.userId === "string" &&
    typeof candidate.userName === "string" &&
    typeof candidate.text === "string" &&
    typeof candidate.sentAt === "number"
  );
}
