export interface AuditEvent {
  requestId: string;
  action: string;
  targetType: "invite" | "session" | "invite_batch";
  targetId: string;
  affected: Record<string, number>;
  timestamp: number;
}

export function emitAuditEvent(
  nodeEnv: string,
  event: AuditEvent,
): void {
  if (nodeEnv !== "production") return;
  console.info(JSON.stringify({ event: "admin_audit", ...event }));
}
