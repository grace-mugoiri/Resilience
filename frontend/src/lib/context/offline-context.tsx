"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { syncQueuedMessages, type QueuedMessage } from "@/lib/api/sync";

const QUEUE_STORAGE_KEY = "resilience.offline_queue";

export type QueuedStatus = "pending" | "syncing" | "failed";

export interface QueuedEntry extends QueuedMessage {
  status: QueuedStatus;
  queuedAt: string;
  reason?: string;
}

interface OfflineContextValue {
  isOnline: boolean;
  queue: QueuedEntry[];
  /** Adds a message to the local outbox. Caller renders it optimistically;
   * this context takes care of getting it to the server, now or later. */
  enqueue: (message: QueuedMessage) => void;
  /** Manually retry sync (e.g. a "Retry" button on a failed item). */
  retrySync: () => void;
  isSyncing: boolean;
}

const OfflineContext = createContext<OfflineContextValue | undefined>(undefined);

function loadQueue(): QueuedEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(QUEUE_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as QueuedEntry[]) : [];
  } catch {
    return [];
  }
}

function saveQueue(queue: QueuedEntry[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(queue));
}

export function OfflineProvider({ children }: { children: React.ReactNode }) {
  const [isOnline, setIsOnline] = useState(true);
  const [queue, setQueue] = useState<QueuedEntry[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const queueRef = useRef<QueuedEntry[]>([]);

  useEffect(() => {
    const loaded = loadQueue();
    queueRef.current = loaded;
    setQueue(loaded);
    setIsOnline(typeof navigator === "undefined" ? true : navigator.onLine);
  }, []);

  const updateQueue = useCallback((next: QueuedEntry[]) => {
    queueRef.current = next;
    setQueue(next);
    saveQueue(next);
  }, []);

  const flush = useCallback(async () => {
    if (queueRef.current.length === 0) return;
    if (typeof navigator !== "undefined" && !navigator.onLine) return;

    setIsSyncing(true);
    const inFlight = queueRef.current.map((entry) => ({ ...entry, status: "syncing" as const }));
    updateQueue(inFlight);

    try {
      const { results } = await syncQueuedMessages(
        inFlight.map(({ client_message_id, target, target_id, body }) => ({
          client_message_id,
          target,
          target_id,
          body,
        }))
      );
      const byId = new Map(results.map((r) => [r.client_message_id, r]));
      const remaining = inFlight
        .map((entry): QueuedEntry | null => {
          const result = byId.get(entry.client_message_id);
          if (!result) return entry; // server didn't report on it; keep for next attempt
          if (result.accepted) return null; // synced — drop from the outbox
          return { ...entry, status: "failed", reason: result.reason ?? "Rejected by server" };
        })
        .filter((e): e is QueuedEntry => e !== null);
      updateQueue(remaining);
    } catch {
      const failed = inFlight.map((entry) => ({
        ...entry,
        status: "failed" as const,
        reason: "Could not reach the server",
      }));
      updateQueue(failed);
    } finally {
      setIsSyncing(false);
    }
  }, [updateQueue]);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      flush();
    };
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [flush]);

  const enqueue = useCallback(
    (message: QueuedMessage) => {
      const entry: QueuedEntry = { ...message, status: "pending", queuedAt: new Date().toISOString() };
      updateQueue([...queueRef.current, entry]);
      if (typeof navigator === "undefined" || navigator.onLine) {
        flush();
      }
    },
    [flush, updateQueue]
  );

  const value = useMemo(
    () => ({ isOnline, queue, enqueue, retrySync: flush, isSyncing }),
    [isOnline, queue, enqueue, flush, isSyncing]
  );

  return <OfflineContext.Provider value={value}>{children}</OfflineContext.Provider>;
}

export function useOffline() {
  const ctx = useContext(OfflineContext);
  if (!ctx) throw new Error("useOffline must be used within OfflineProvider");
  return ctx;
}
