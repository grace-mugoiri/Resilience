"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { MessageCircle, User } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { VerificationBadge } from "@/components/ui/verification-badge";
import { LoadingState, ErrorState, EmptyState } from "@/components/ui/states";
import { useSession } from "@/lib/context/session-context";
import { listCounselors } from "@/lib/api/counselors";
import { listConversations } from "@/lib/api/messages";
import { ApiError } from "@/lib/api/client";
import { formatRelativeTime } from "@/lib/utils";
import type { Conversation, CounselorProfile } from "@/lib/types";

export default function CounselorDashboardPage() {
  const { identity } = useSession();
  const [profile, setProfile] = useState<CounselorProfile | null | undefined>(undefined);
  const [conversations, setConversations] = useState<Conversation[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!identity) return;
    listCounselors()
      .then((all) => setProfile(all.find((c) => c.identity_id === identity.id) ?? null))
      .catch((e) => setError(e instanceof ApiError ? e.message : "Could not load your profile"));
    listConversations()
      .then(setConversations)
      .catch((e) => setError(e instanceof ApiError ? e.message : "Could not load conversations"));
  }, [identity]);

  if (error) return <ErrorState description={error} />;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5 px-4 py-6">
      <h1 className="text-xl font-bold text-foreground">Welcome back{identity ? `, ${identity.pseudonym}` : ""}</h1>

      {profile === undefined ? (
        <LoadingState />
      ) : profile === null ? (
        <Card className="flex flex-col items-center gap-3 py-8 text-center">
          <User className="h-8 w-8 text-primary" aria-hidden="true" />
          <p className="font-semibold text-foreground">Finish setting up your profile</p>
          <Link href="/onboarding/counselor/profile" className="text-sm font-medium text-primary hover:underline">
            Set up profile
          </Link>
        </Card>
      ) : (
        <Link href="/counselor/profile">
          <Card className="flex items-center gap-3 hover:border-primary/40">
            <Avatar seed={profile.identity_id} label={profile.display_name} size="lg" />
            <div>
              <p className="font-semibold text-foreground">{profile.display_name}</p>
              <VerificationBadge status={profile.verification_status} organization={profile.attesting_organization} />
            </div>
          </Card>
        </Link>
      )}

      <div>
        <p className="mb-2 text-sm font-semibold text-foreground">Conversations</p>
        {conversations === null ? (
          <LoadingState />
        ) : conversations.length === 0 ? (
          <EmptyState icon={MessageCircle} title="No messages yet" description="Survivor conversations will appear here." />
        ) : (
          <div className="flex flex-col divide-y divide-border rounded-2xl border border-border bg-surface">
            {conversations.map((c) => (
              <Link key={c.id} href={`/counselor/messages/${c.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-surface-muted">
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
          </div>
        )}
      </div>
    </div>
  );
}
