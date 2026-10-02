import { apiFetch } from "./client";
import type { Conversation, DirectMessage } from "@/lib/types";

export function listConversations() {
  return apiFetch<Conversation[]>("/api/messages");
}

export function startConversation(counterpartIdentityId: string) {
  return apiFetch<Conversation>("/api/messages", {
    method: "POST",
    body: JSON.stringify({ counterpart_identity_id: counterpartIdentityId }),
  });
}

export function listDirectMessages(conversationId: string) {
  return apiFetch<DirectMessage[]>(`/api/messages/${conversationId}`);
}

export function postDirectMessage(conversationId: string, body: string, clientMessageId: string) {
  return apiFetch<DirectMessage>(`/api/messages/${conversationId}`, {
    method: "POST",
    body: JSON.stringify({ body, client_message_id: clientMessageId }),
  });
}
