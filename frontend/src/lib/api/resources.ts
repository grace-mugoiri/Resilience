import { apiFetch } from "./client";
import type { Resource, ResourceCategory } from "@/lib/types";

export function listResources(category?: ResourceCategory) {
  const qs = category ? `?category=${category}` : "";
  return apiFetch<Resource[]>(`/api/resources${qs}`, { auth: false });
}
