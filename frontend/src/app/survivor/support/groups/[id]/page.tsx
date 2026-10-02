"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, CheckCircle2, ShieldCheck, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { LoadingState, ErrorState } from "@/components/ui/states";
import { AccountGate } from "@/components/onboarding/account-gate";
import { getGroup, joinGroup } from "@/lib/api/groups";
import { ApiError } from "@/lib/api/client";
import type { Group } from "@/lib/types";

export default function GroupDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [group, setGroup] = useState<Group | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [justRequested, setJustRequested] = useState(false);
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    getGroup(id)
      .then(setGroup)
      .catch((e) => setError(e instanceof ApiError ? e.message : "Could not load this group"));
  }, [id]);

  async function handleJoin() {
    setJoining(true);
    try {
      const res = await joinGroup(id);
      setGroup((g) => (g ? { ...g, is_member: res.joined, is_pending: res.pending, member_count: res.member_count } : g));
      if (res.pending) setJustRequested(true);
      else router.push(`/survivor/messages/group/${id}`);
    } finally {
      setJoining(false);
    }
  }

  if (error) return <ErrorState description={error} />;
  if (!group) return <LoadingState />;

  const [description, whatOthersSee] = group.description.split("\n\n");

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5 px-4 py-6">
      <button onClick={() => router.back()} className="flex items-center gap-1 self-start text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back
      </button>

      <div>
        <h1 className="text-xl font-bold text-foreground">{group.name}</h1>
        <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
          <Users className="h-4 w-4" aria-hidden="true" />
          {group.member_count} members · Led by {group.facilitator_name} (Moderator)
        </p>
      </div>

      <p className="text-sm text-foreground">{description}</p>

      {whatOthersSee && (
        <Card className="bg-surface-muted">
          <p className="flex items-start gap-2 text-sm text-muted-foreground">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
            {whatOthersSee}
          </p>
        </Card>
      )}

      {group.rules.length > 0 && (
        <div>
          <p className="mb-2 text-sm font-semibold text-foreground">Group rules</p>
          <ol className="flex flex-col gap-1.5">
            {group.rules.map((rule, i) => (
              <li key={i} className="flex gap-2 text-sm text-muted-foreground">
                <span className="font-medium text-foreground">{i + 1}.</span> {rule}
              </li>
            ))}
          </ol>
        </div>
      )}

      <AccountGate feature="joining a group">
        {group.is_member ? (
          <Button size="lg" className="w-full" onClick={() => router.push(`/survivor/messages/group/${id}`)}>
            Go to group
          </Button>
        ) : group.is_pending || justRequested ? (
          <Card className="flex items-center gap-3 border-success/30 bg-success-tint">
            <CheckCircle2 className="h-5 w-5 shrink-0 text-success" aria-hidden="true" />
            <p className="text-sm text-foreground">
              Request sent. {group.facilitator_name} will review it, discreetly.
            </p>
          </Card>
        ) : (
          <Button size="lg" className="w-full" disabled={joining} onClick={handleJoin}>
            {group.requires_approval ? "Request to join" : "Join group"}
          </Button>
        )}
      </AccountGate>
    </div>
  );
}
