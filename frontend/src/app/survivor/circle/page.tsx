"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Users, UserPlus } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { LoadingState, ErrorState, EmptyState } from "@/components/ui/states";
import { AccountGate } from "@/components/onboarding/account-gate";
import { listCircle } from "@/lib/api/circle";
import { ApiError } from "@/lib/api/client";
import type { CircleMember } from "@/lib/types";

export default function CirclePage() {
  const [members, setMembers] = useState<CircleMember[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listCircle()
      .then(setMembers)
      .catch((e) => setError(e instanceof ApiError ? e.message : "Could not load your circle"));
  }, []);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5 px-4 py-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">My circle</h1>
          <p className="text-sm text-muted-foreground">The people you trust, in one private space.</p>
        </div>
        <Link href="/survivor/circle/invite">
          <Button size="sm">
            <UserPlus className="h-4 w-4" aria-hidden="true" /> Invite
          </Button>
        </Link>
      </div>

      <AccountGate feature="My circle">
        {error && <ErrorState description={error} />}
        {members === null && !error ? (
          <LoadingState />
        ) : members!.length === 0 ? (
          <EmptyState icon={Users} title="Your circle is empty" description="Invite someone you trust to join it." />
        ) : (
          <div className="flex flex-col divide-y divide-border rounded-2xl border border-border bg-surface">
            {members!.map((m) => (
              <Link key={m.id} href={`/survivor/circle/${m.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-surface-muted">
                <Avatar seed={m.member_identity_id} label={m.pseudonym} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-foreground">{m.pseudonym}</p>
                  {m.label && <p className="truncate text-sm text-muted-foreground">{m.label}</p>}
                </div>
              </Link>
            ))}
          </div>
        )}
      </AccountGate>
    </div>
  );
}
