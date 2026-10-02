import { apiFetch } from "./client";
import type { Group, GroupMessage } from "@/lib/types";

export function listGroups() {
  return apiFetch<Group[]>("/api/groups");
}

export function getGroup(id: string) {
  return apiFetch<Group>(`/api/groups/${id}`);
}

export function joinGroup(id: string) {
  return apiFetch<{ group_id: string; joined: boolean; pending: boolean; member_count: number }>(
    `/api/groups/${id}/join`,
    { method: "POST" }
  );
}

export function listGroupMessages(id: string) {
  return apiFetch<GroupMessage[]>(`/api/groups/${id}/messages`);
}

export function postGroupMessage(id: string, body: string, clientMessageId: string) {
  return apiFetch<GroupMessage>(`/api/groups/${id}/messages`, {
    method: "POST",
    body: JSON.stringify({ body, client_message_id: clientMessageId }),
  });
}
