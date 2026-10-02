"use client";

import { useState } from "react";
import { useSession } from "@/lib/context/session-context";
import { useMessageThread, type ThreadTarget } from "@/lib/hooks/use-message-thread";
import { MessageBubble } from "./message-bubble";
import { LoadingState, ErrorState, EmptyState } from "@/components/ui/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send, MessageCircle } from "lucide-react";
import { formatRelativeTime } from "@/lib/utils";

export function ChatThread({ target, quickReplies }: { target: ThreadTarget; quickReplies?: string[] }) {
  const { identity } = useSession();
  const { messages, loading, error, send, reload } = useMessageThread(target, identity?.id ?? "");
  const [draft, setDraft] = useState("");

  async function handleSend(body?: string) {
    const text = (body ?? draft).trim();
    if (!text) return;
    setDraft("");
    await send(text);
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {loading && <LoadingState label="Loading conversation…" />}
        {error && <ErrorState description={error} onRetry={reload} />}
        {!loading && !error && messages.length === 0 && (
          <EmptyState icon={MessageCircle} title="No messages yet" description="Say hello — this space is private." />
        )}
        <div className="flex flex-col gap-3">
          {messages.map((m) => (
            <MessageBubble
              key={m.clientMessageId}
              body={m.body}
              mine={m.senderId === identity?.id}
              status={m.status}
              timeLabel={formatRelativeTime(m.createdAt)}
              onRetry={() => handleSend(m.body)}
            />
          ))}
        </div>
      </div>

      {quickReplies && quickReplies.length > 0 && (
        <div className="flex gap-2 overflow-x-auto border-t border-border px-4 py-2">
          {quickReplies.map((qr) => (
            <button
              key={qr}
              onClick={() => setDraft(qr)}
              className="shrink-0 rounded-full border border-border bg-surface-muted px-3 py-1.5 text-xs text-foreground hover:bg-border"
            >
              {qr}
            </button>
          ))}
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSend();
        }}
        className="flex items-center gap-2 border-t border-border p-3"
      >
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Type a message…"
          aria-label="Message"
        />
        <Button type="submit" size="md" aria-label="Send message">
          <Send className="h-4 w-4" aria-hidden="true" />
        </Button>
      </form>
    </div>
  );
}
