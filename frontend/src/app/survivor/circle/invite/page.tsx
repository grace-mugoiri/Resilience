"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { useSession } from "@/lib/context/session-context";
import { addCircleMember } from "@/lib/api/circle";
import { ApiError } from "@/lib/api/client";

export default function InviteToCirclePage() {
  const router = useRouter();
  const { identity } = useSession();
  const [backupId, setBackupId] = useState("");
  const [label, setLabel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await addCircleMember(backupId.trim(), label.trim());
      router.push("/survivor/circle");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not add this person");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-md flex-col gap-5 px-4 py-6">
      <button onClick={() => router.back()} className="flex items-center gap-1 self-start text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back
      </button>

      <div>
        <h1 className="text-lg font-bold text-foreground">Invite to your circle</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Ask them to share their backup ID from Settings — it&apos;s safe to share and doesn&apos;t expose their
          backup words.
        </p>
      </div>

      {identity && (
        <Card className="bg-surface-muted">
          <p className="text-xs font-medium text-muted-foreground">Your backup ID (share this with them)</p>
          <p className="mt-1 break-all font-mono text-sm text-foreground">{identity.id}</p>
        </Card>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Field label="Their backup ID" htmlFor="backupId">
          <Input id="backupId" value={backupId} onChange={(e) => setBackupId(e.target.value)} required />
        </Field>
        <Field label="Nickname for them (optional)" htmlFor="label">
          <Input id="label" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={60} />
        </Field>
        {error && <p className="text-sm text-danger">{error}</p>}
        <Button type="submit" disabled={submitting || !backupId.trim()}>
          Add to my circle
        </Button>
      </form>
    </div>
  );
}
