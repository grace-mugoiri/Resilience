import { apiFetch } from "./client";
import type { Identity, IdentityAuthResponse, IdentityCreateResponse, IdentityRole } from "@/lib/types";

export function createIdentity(role: IdentityRole, pin: string, pseudonym?: string) {
  return apiFetch<IdentityCreateResponse>("/api/identity", {
    method: "POST",
    auth: false,
    body: JSON.stringify({ role, pin, pseudonym }),
  });
}

export function restoreIdentity(recovery_phrase: string, pin: string) {
  return apiFetch<IdentityAuthResponse>("/api/identity/restore", {
    method: "POST",
    auth: false,
    body: JSON.stringify({ recovery_phrase, pin }),
  });
}

export function loginIdentity(identity_id: string, pin: string) {
  return apiFetch<IdentityAuthResponse>("/api/identity/login", {
    method: "POST",
    auth: false,
    body: JSON.stringify({ identity_id, pin }),
  });
}

export function getMe() {
  return apiFetch<Identity>("/api/identity/me");
}

export function changePin(currentPin: string, newPin: string) {
  return apiFetch<Identity>("/api/identity/change-pin", {
    method: "POST",
    body: JSON.stringify({ current_pin: currentPin, new_pin: newPin }),
  });
}
