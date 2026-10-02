"use client";

import { useRouter } from "next/navigation";
import { Check, X } from "lucide-react";
import { SettingsSubpage } from "@/components/layout/settings-subpage";
import { Card } from "@/components/ui/card";
import { HoldToConfirmButton } from "@/components/ui/hold-to-confirm-button";
import { useSession } from "@/lib/context/session-context";

const WILL_DELETE = [
  "Your PIN and session on this device",
  "Locally cached messages and queued offline drafts",
  "Your backup-word confirmation status",
];

const WONT_DELETE = [
  "Messages already delivered to others",
  "Copies kept by counselors or group members",
  "Your account itself — it still exists if you have your backup words",
];

export default function ClearDataPage() {
  const router = useRouter();
  const { forgetDevice } = useSession();

  function handleConfirm() {
    if (typeof window !== "undefined") {
      const keysToRemove: string[] = [];
      for (let i = 0; i < window.localStorage.length; i++) {
        const key = window.localStorage.key(i);
        if (key && key.startsWith("resilience.")) keysToRemove.push(key);
      }
      keysToRemove.forEach((k) => window.localStorage.removeItem(k));
      window.sessionStorage.clear();
    }
    forgetDevice();
    router.replace("/");
  }

  return (
    <SettingsSubpage title="Clear everything">
      <Card>
        <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-success">
          <Check className="h-4 w-4" aria-hidden="true" /> This will delete
        </p>
        <ul className="flex flex-col gap-1 text-sm text-muted-foreground">
          {WILL_DELETE.map((item) => (
            <li key={item}>• {item}</li>
          ))}
        </ul>
      </Card>
      <Card>
        <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-danger">
          <X className="h-4 w-4" aria-hidden="true" /> This won&apos;t delete
        </p>
        <ul className="flex flex-col gap-1 text-sm text-muted-foreground">
          {WONT_DELETE.map((item) => (
            <li key={item}>• {item}</li>
          ))}
        </ul>
      </Card>

      <p className="text-center text-xs text-muted-foreground">
        Make sure you&apos;ve backed up your account first — this can&apos;t be undone.
      </p>
      <HoldToConfirmButton label="Hold to clear everything" onConfirm={handleConfirm} />
    </SettingsSubpage>
  );
}
