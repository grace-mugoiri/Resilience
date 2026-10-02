"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { ChatThread } from "@/components/messaging/chat-thread";
import { ChatMenu } from "@/components/messaging/chat-menu";
import { LoadingState, ErrorState } from "@/components/ui/states";
import { listConversations } from "@/lib/api/messages";
import { ApiError } from "@/lib/api/client";
import type { Conversation } from "@/lib/types";

export default function PrivateChatPage({ params }: { params: Promise<{ conversationId: string }> }) {
  const { conversationId } = use(params);
  const router = useRouter();
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listConversations()
      .then((all) => {
        const found = all.find((c) => c.id === conversationId);
        if (!found) {
          setError("Conversation not found");
          return;
        }
        setConversation(found);
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : "Could not load this conversation"));
  }, [conversationId]);

  if (error) return <ErrorState description={error} />;
  if (!conversation) return <LoadingState />;

  return (
    <div className="mx-auto flex h-[calc(100vh-4rem)] max-w-2xl flex-col">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <button onClick={() => router.back()} className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        </button>
        <Avatar seed={conversation.counterpart_identity_id} label={conversation.counterpart_pseudonym} size="sm" />
        <p className="flex-1 font-semibold text-foreground">{conversation.counterpart_pseudonym}</p>
        <ChatMenu conversationId={conversationId} reportHref={`/survivor/messages/${conversationId}/report`} />
      </div>
      <ChatThread target={{ type: "direct", id: conversationId }} />
    </div>
  );
}
