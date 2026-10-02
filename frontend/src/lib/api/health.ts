import { apiFetch } from "./client";
import type { HealthRecord, HealthShare } from "@/lib/types";

export function listHealthRecords() {
  return apiFetch<HealthRecord[]>("/api/health/records");
}

export function createHealthRecord(payload: { record_type: string; title: string; body?: string }) {
  return apiFetch<HealthRecord>("/api/health/records", { method: "POST", body: JSON.stringify(payload) });
}

export function shareHealthRecord(recordId: string, counselorIdentityId: string) {
  return apiFetch<HealthShare>("/api/health/share", {
    method: "POST",
    body: JSON.stringify({ record_id: recordId, counselor_identity_id: counselorIdentityId }),
  });
}

export function revokeHealthShare(shareId: string) {
  return apiFetch<void>(`/api/health/share/${shareId}`, { method: "DELETE" });
}
