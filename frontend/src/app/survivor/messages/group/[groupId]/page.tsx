"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { ChatThread } from "@/components/messaging/chat-thread";
import { LoadingState, ErrorState } from "@/components/ui/states";
import { getGroup } from "@/lib/api/groups";
import { ApiError } from "@/lib/api/client";
import type { Group } from "@/lib/types";

export default function GroupChatPage({ params }: { params: Promise<{ groupId: string }> }) {
  const { groupId } = use(params);
  const router = useRouter();
  const [group, setGroup] = useState<Group | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getGroup(groupId)
      .then((g) => {
        if (!g.is_member) {
          router.replace(`/survivor/support/groups/${groupId}`);
          return;
        }
        setGroup(g);
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : "Could not load this group"));
  }, [groupId, router]);

  if (error) return <ErrorState description={error} />;
  if (!group) return <LoadingState />;

  return (
    <div className="mx-auto flex h-[calc(100vh-4rem)] max-w-2xl flex-col">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <button onClick={() => router.back()} className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        </button>
        <div>
          <p className="font-semibold text-foreground">{group.name}</p>
          <p className="text-xs text-muted-foreground">{group.member_count} members</p>
        </div>
      </div>
      <ChatThread target={{ type: "group", id: groupId }} />
    </div>
  );
}
