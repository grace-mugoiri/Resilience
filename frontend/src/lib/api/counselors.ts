import { apiFetch } from "./client";
import type { CounselorProfile, VerificationStatus } from "@/lib/types";

export function listCounselors(verificationStatus?: VerificationStatus) {
  const qs = verificationStatus ? `?verification_status=${verificationStatus}` : "";
  return apiFetch<CounselorProfile[]>(`/api/counselors${qs}`, { auth: false });
}

export function getCounselor(id: string) {
  return apiFetch<CounselorProfile>(`/api/counselors/${id}`, { auth: false });
}

export function createCounselorProfile(payload: {
  display_name: string;
  bio?: string;
  specialties?: string[];
  languages?: string[];
  attesting_organization?: string;
}) {
  return apiFetch<CounselorProfile>("/api/counselors", { method: "POST", body: JSON.stringify(payload) });
}

export function updateCounselorProfile(
  id: string,
  payload: Partial<{ bio: string; specialties: string[]; languages: string[]; is_available: boolean }>
) {
  return apiFetch<CounselorProfile>(`/api/counselors/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
}
