"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, MessageCircle, ShieldQuestion } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { VerificationBadge } from "@/components/ui/verification-badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { LoadingState, ErrorState } from "@/components/ui/states";
import { AccountGate } from "@/components/onboarding/account-gate";
import { useSession } from "@/lib/context/session-context";
import { getCounselor } from "@/lib/api/counselors";
import { startConversation } from "@/lib/api/messages";
import { ApiError } from "@/lib/api/client";
import { parseServerDate } from "@/lib/utils";
import type { CounselorProfile } from "@/lib/types";

export default function CounselorProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { identity } = useSession();
  const [counselor, setCounselor] = useState<CounselorProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAccordion, setShowAccordion] = useState(false);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    getCounselor(id)
      .then(setCounselor)
      .catch((e) => setError(e instanceof ApiError ? e.message : "Could not load this profile"));
  }, [id]);

  async function handleMessage() {
    if (!counselor) return;
    setStarting(true);
    try {
      const conversation = await startConversation(counselor.identity_id);
      router.push(`/survivor/messages/${conversation.id}`);
    } finally {
      setStarting(false);
    }
  }

  if (error) return <ErrorState description={error} />;
  if (!counselor) return <LoadingState />;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5 px-4 py-6">
      <button onClick={() => router.back()} className="flex items-center gap-1 self-start text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back
      </button>

      <div className="flex items-center gap-4">
        <Avatar seed={counselor.identity_id} label={counselor.display_name} size="lg" />
        <div>
          <h1 className="text-lg font-bold text-foreground">{counselor.display_name}</h1>
          <VerificationBadge status={counselor.verification_status} organization={counselor.attesting_organization} />
        </div>
      </div>

      <p className="text-sm text-foreground">{counselor.bio}</p>

      {counselor.specialties.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {counselor.specialties.map((s) => (
            <span key={s} className="rounded-full bg-surface-muted px-2.5 py-1 text-xs text-muted-foreground">
              {s}
            </span>
          ))}
        </div>
      )}
      {counselor.languages.length > 0 && (
        <p className="text-sm text-muted-foreground">Speaks: {counselor.languages.join(", ")}</p>
      )}

      <Card>
        <VerificationBadge status={counselor.verification_status} organization={counselor.attesting_organization} />
        {counselor.verification_expires_at && counselor.verification_status === "verified" && (
          <p className="mt-1 text-sm text-muted-foreground">
            Verification expires{" "}
            {parseServerDate(counselor.verification_expires_at).toLocaleDateString(undefined, { month: "long", year: "numeric" })}
          </p>
        )}
        <button
          onClick={() => setShowAccordion((s) => !s)}
          className="mt-2 flex items-center gap-1 text-sm font-medium text-primary hover:underline"
        >
          <ShieldQuestion className="h-4 w-4" aria-hidden="true" />
          How verification works
        </button>
        {showAccordion && (
          <p className="mt-2 text-sm text-muted-foreground">
            Resilience does not itself verify counselors. Verification status is asserted by an external partner
            organization named above, and can change if that organization updates or revokes it.
          </p>
        )}
      </Card>

      <AccountGate feature="messaging a counselor">
        <Button size="lg" className="w-full" disabled={starting} onClick={handleMessage}>
          <MessageCircle className="h-4 w-4" aria-hidden="true" />
          {identity ? "Message privately" : "Sign in to message"}
        </Button>
      </AccountGate>
    </div>
  );
}
