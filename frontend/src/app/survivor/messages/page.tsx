"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { MessageCircle } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { LoadingState, ErrorState, EmptyState } from "@/components/ui/states";
import { AccountGate } from "@/components/onboarding/account-gate";
import { listConversations } from "@/lib/api/messages";
import { listGroups } from "@/lib/api/groups";
import { ApiError } from "@/lib/api/client";
import { formatRelativeTime } from "@/lib/utils";
import type { Conversation, Group } from "@/lib/types";

export default function MessagesInboxPage() {
  const [conversations, setConversations] = useState<Conversation[] | null>(null);
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([listConversations(), listGroups()])
      .then(([c, g]) => {
        setConversations(c);
        setGroups(g.filter((group) => group.is_member));
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : "Could not load messages"));
  }, []);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5 px-4 py-6">
      <h1 className="text-xl font-bold text-foreground">Messages</h1>

      <AccountGate feature="messages">
        {error && <ErrorState description={error} />}
        {(conversations === null || groups === null) && !error ? (
          <LoadingState />
        ) : conversations!.length === 0 && groups!.length === 0 ? (
          <EmptyState
            icon={MessageCircle}
            title="No conversations yet"
            description="Messages with counselors and your groups will show up here."
          />
        ) : (
          <div className="flex flex-col divide-y divide-border rounded-2xl border border-border bg-surface">
            {conversations!.map((c) => (
              <Link key={c.id} href={`/survivor/messages/${c.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-surface-muted">
                <Avatar seed={c.counterpart_identity_id} label={c.counterpart_pseudonym} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-foreground">{c.counterpart_pseudonym}</p>
                  <p className="truncate text-sm text-muted-foreground">{c.last_message_preview || "Say hello"}</p>
                </div>
                {c.last_message_at && (
                  <span className="shrink-0 text-xs text-muted-foreground">{formatRelativeTime(c.last_message_at)}</span>
                )}
              </Link>
            ))}
            {groups!.map((g) => (
              <Link key={g.id} href={`/survivor/messages/group/${g.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-surface-muted">
                <Avatar seed={g.id} label={g.name} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-foreground">{g.name}</p>
                  <p className="truncate text-sm text-muted-foreground">{g.member_count} members</p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </AccountGate>
    </div>
  );
}
