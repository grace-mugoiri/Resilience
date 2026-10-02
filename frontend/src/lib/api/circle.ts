import { apiFetch } from "./client";
import type { CircleMember } from "@/lib/types";

export function listCircle() {
  return apiFetch<CircleMember[]>("/api/circle");
}

export function addCircleMember(memberIdentityId: string, label = "") {
  return apiFetch<CircleMember>("/api/circle", {
    method: "POST",
    body: JSON.stringify({ member_identity_id: memberIdentityId, label }),
  });
}

export function removeCircleMember(id: string) {
  return apiFetch<void>(`/api/circle/${id}`, { method: "DELETE" });
}
