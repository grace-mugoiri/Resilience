import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatSats(sats: number): string {
  return `${sats.toLocaleString("en-US")} sats`;
}

/** The backend serializes naive UTC timestamps (no "Z"/offset suffix), which
 * `new Date()` would otherwise parse as local time. Force UTC interpretation
 * so relative/absolute times are correct regardless of the viewer's timezone. */
export function parseServerDate(iso: string): Date {
  const hasTimezone = /Z$|[+-]\d{2}:\d{2}$/.test(iso);
  return new Date(hasTimezone ? iso : `${iso}Z`);
}

export function formatRelativeTime(iso: string): string {
  const date = parseServerDate(iso);
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.round(diffMs / 60000);
  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return date.toLocaleDateString();
}
