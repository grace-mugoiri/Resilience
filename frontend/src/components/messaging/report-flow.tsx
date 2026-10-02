"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

const REASONS = [
  "Harassment",
  "Asking for personal details",
  "Pretending to be someone else",
  "Spam",
  "Something else",
];

export function ReportFlow({ conversationHref }: { conversationHref: string }) {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2 | "done">(1);
  const [reason, setReason] = useState<string | null>(null);
  const [attachMessages, setAttachMessages] = useState(true);

  if (step === "done") {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-4 px-4 py-16 text-center">
        <CheckCircle2 className="h-10 w-10 text-success" aria-hidden="true" />
        <p className="font-semibold text-foreground">Report sent</p>
        <p className="text-sm text-muted-foreground">
          Thank you — a moderator will review this. You can keep this conversation or leave it at any time.
        </p>
        <Button onClick={() => router.push(conversationHref)}>Back to conversation</Button>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-md flex-col gap-5 px-4 py-6">
      <button onClick={() => router.back()} className="flex items-center gap-1 self-start text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back
      </button>

      {step === 1 && (
        <>
          <h1 className="text-lg font-bold text-foreground">Why are you reporting this?</h1>
          <div className="flex flex-col gap-2">
            {REASONS.map((r) => (
              <label
                key={r}
                className="flex cursor-pointer items-center gap-3 rounded-xl border border-border px-4 py-3 has-[:checked]:border-primary has-[:checked]:bg-primary-tint"
              >
                <input type="radio" name="reason" value={r} checked={reason === r} onChange={() => setReason(r)} className="accent-[var(--color-primary)]" />
                <span className="text-sm text-foreground">{r}</span>
              </label>
            ))}
          </div>
          <Button disabled={!reason} onClick={() => setStep(2)}>
            Continue
          </Button>
        </>
      )}

      {step === 2 && (
        <>
          <h1 className="text-lg font-bold text-foreground">Add context (optional)</h1>
          <Card>
            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                checked={attachMessages}
                onChange={(e) => setAttachMessages(e.target.checked)}
                className="mt-0.5 accent-[var(--color-primary)]"
              />
              <span className="text-sm text-foreground">
                Attach the last 5 messages from this conversation to help moderators understand what happened.
              </span>
            </label>
          </Card>
          <Button onClick={() => setStep("done")}>Submit report</Button>
        </>
      )}
    </div>
  );
}
