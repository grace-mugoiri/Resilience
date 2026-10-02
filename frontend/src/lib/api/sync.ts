import { apiFetch } from "./client";

export type QueuedMessageTarget = "group" | "direct";

export interface QueuedMessage {
  client_message_id: string;
  target: QueuedMessageTarget;
  target_id: string;
  body: string;
}

export interface SyncResultItem {
  client_message_id: string;
  accepted: boolean;
  server_id: string | null;
  reason: string | null;
}

export function syncQueuedMessages(messages: QueuedMessage[]) {
  return apiFetch<{ results: SyncResultItem[]; synced_at: string }>("/api/sync", {
    method: "POST",
    body: JSON.stringify({ messages }),
  });
}
