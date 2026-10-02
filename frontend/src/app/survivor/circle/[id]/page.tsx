"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, UserMinus } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { ChatThread } from "@/components/messaging/chat-thread";
import { ChatMenu } from "@/components/messaging/chat-menu";
import { LoadingState, ErrorState } from "@/components/ui/states";
import { listCircle, removeCircleMember } from "@/lib/api/circle";
import { startConversation } from "@/lib/api/messages";
import { ApiError } from "@/lib/api/client";

const QUICK_REPLIES = ["Thinking of you", "Can we talk when you're free?", "I'm okay right now", "I need support"];

export default function CircleChatPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [pseudonym, setPseudonym] = useState<string | null>(null);
  const [seed, setSeed] = useState<string>("");
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listCircle()
      .then(async (members) => {
        const member = members.find((m) => m.id === id);
        if (!member) {
          setError("This circle member could not be found");
          return;
        }
        setPseudonym(member.pseudonym);
        setSeed(member.member_identity_id);
        const conversation = await startConversation(member.member_identity_id);
        setConversationId(conversation.id);
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : "Could not open this conversation"));
  }, [id]);

  if (error) return <ErrorState description={error} />;
  if (!conversationId || !pseudonym) return <LoadingState />;

  return (
    <div className="mx-auto flex h-[calc(100vh-4rem)] max-w-2xl flex-col">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <button onClick={() => router.back()} className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        </button>
        <Avatar seed={seed} label={pseudonym} size="sm" />
        <p className="flex-1 font-semibold text-foreground">{pseudonym}</p>
        <ChatMenu
          conversationId={conversationId}
          reportHref={`/survivor/messages/${conversationId}/report`}
          extraAction={{
            label: "Remove from circle",
            icon: UserMinus,
            onSelect: async () => {
              await removeCircleMember(id);
              router.push("/survivor/circle");
            },
          }}
        />
      </div>
      <ChatThread target={{ type: "direct", id: conversationId }} quickReplies={QUICK_REPLIES} />
    </div>
  );
}
