"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { listGroupMessages, postGroupMessage } from "@/lib/api/groups";
import { listDirectMessages, postDirectMessage } from "@/lib/api/messages";
import { ApiError } from "@/lib/api/client";
import { useOffline } from "@/lib/context/offline-context";
import type { MessageDeliveryStatus } from "@/components/messaging/message-bubble";

export type ThreadTarget = { type: "group" | "direct"; id: string };

export interface ThreadMessage {
  id: string;
  body: string;
  senderId: string;
  senderLabel: string;
  createdAt: string;
  clientMessageId: string;
  status: MessageDeliveryStatus;
}

async function fetchServerMessages(target: ThreadTarget, currentIdentityId: string) {
  if (target.type === "group") {
    const messages = await listGroupMessages(target.id);
    return messages.map((m) => ({
      id: m.id,
      body: m.body,
      senderId: m.sender_identity_id,
      senderLabel: m.sender_pseudonym,
      createdAt: m.created_at,
      clientMessageId: m.client_message_id,
      status: "sent" as const,
    }));
  }
  const messages = await listDirectMessages(target.id);
  return messages.map((m) => ({
    id: m.id,
    body: m.body,
    senderId: m.sender_identity_id,
    senderLabel: m.sender_identity_id === currentIdentityId ? "You" : "",
    createdAt: m.created_at,
    clientMessageId: m.client_message_id,
    status: "sent" as const,
  }));
}

const CLEARED_KEY_PREFIX = "resilience.cleared_at.";

/** "Clear this conversation from my phone" is local-only, matching the
 * honesty of the Figma's "Clear everything" copy — it hides history on this
 * device without deleting anything from the server or other participants. */
export function clearConversationLocally(targetId: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(CLEARED_KEY_PREFIX + targetId, new Date().toISOString());
}

function readClearedAt(targetId: string): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(CLEARED_KEY_PREFIX + targetId);
}

export function useMessageThread(target: ThreadTarget, currentIdentityId: string) {
  const { queue, enqueue, isOnline } = useOffline();
  const [serverMessages, setServerMessages] = useState<ThreadMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const messages = await fetchServerMessages(target, currentIdentityId);
      const clearedAt = readClearedAt(target.id);
      setServerMessages(clearedAt ? messages.filter((m) => m.createdAt > clearedAt) : messages);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load messages");
    } finally {
      setLoading(false);
    }
  }, [target.type, target.id, currentIdentityId]);

  useEffect(() => {
    load();
  }, [load]);

  // Reload once the offline queue drains (a flush likely just landed new messages).
  const queueLenForTarget = queue.filter((q) => q.target_id === target.id).length;
  useEffect(() => {
    if (queueLenForTarget === 0) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queueLenForTarget]);

  const outboxMessages: ThreadMessage[] = useMemo(
    () =>
      queue
        .filter((q) => q.target_id === target.id)
        .map((q) => ({
          id: q.client_message_id,
          body: q.body,
          senderId: currentIdentityId,
          senderLabel: "You",
          createdAt: q.queuedAt,
          clientMessageId: q.client_message_id,
          status: (q.status === "failed" ? "failed" : "queued") as MessageDeliveryStatus,
        })),
    [queue, target.id, currentIdentityId]
  );

  const messages = useMemo(() => {
    const seen = new Set(outboxMessages.map((m) => m.clientMessageId));
    return [...serverMessages.filter((m) => !seen.has(m.clientMessageId)), ...outboxMessages];
  }, [serverMessages, outboxMessages]);

  const send = useCallback(
    async (body: string) => {
      const clientMessageId =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

      if (!isOnline) {
        enqueue({ client_message_id: clientMessageId, target: target.type, target_id: target.id, body });
        return;
      }

      try {
        if (target.type === "group") {
          await postGroupMessage(target.id, body, clientMessageId);
        } else {
          await postDirectMessage(target.id, body, clientMessageId);
        }
        await load();
      } catch {
        enqueue({ client_message_id: clientMessageId, target: target.type, target_id: target.id, body });
      }
    },
    [target.type, target.id, isOnline, enqueue, load]
  );

  return { messages, loading, error, send, reload: load };
}
