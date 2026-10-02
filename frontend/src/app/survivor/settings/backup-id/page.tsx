"use client";

import { useState } from "react";
import { Copy, Check, ShieldAlert } from "lucide-react";
import { SettingsSubpage } from "@/components/layout/settings-subpage";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useSession } from "@/lib/context/session-context";

export default function BackupIdPage() {
  const { identity } = useSession();
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    if (!identity) return;
    await navigator.clipboard.writeText(identity.id);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <SettingsSubpage title="Your backup ID">
      <p className="text-sm text-muted-foreground">
        This public identifier is safe to share — for example with a counselor for verification, or a friend
        you&apos;re inviting to your circle. It cannot be used to access your account.
      </p>

      <Card className="bg-surface-muted">
        <p className="break-all font-mono text-sm text-foreground">{identity?.id}</p>
      </Card>

      <Button variant="secondary" onClick={handleCopy}>
        {copied ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
        {copied ? "Copied" : "Copy ID to clipboard"}
      </Button>

      <div className="flex items-start gap-2 rounded-xl bg-warning-tint p-3 text-sm text-warning">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        This is different from your backup words. Never share your backup words with anyone — not even a counselor
        or organization.
      </div>
    </SettingsSubpage>
  );
}
