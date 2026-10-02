"use client";

import { useRouter } from "next/navigation";
import { Lock, EyeOff, UserX, Trash2 } from "lucide-react";
import { PublicShell } from "@/components/layout/public-shell";
import { Button } from "@/components/ui/button";

const PROMISES = [
  { icon: UserX, text: "You never need to share your real name, email, or phone number." },
  { icon: EyeOff, text: "No one can find you unless you choose to be found." },
  { icon: Lock, text: "Your private messages and records stay under your control." },
  { icon: Trash2, text: "You can clear your local data or leave at any time." },
];

export default function PromisePage() {
  const router = useRouter();

  return (
    <PublicShell>
      <div className="flex flex-1 flex-col justify-center gap-8">
        <div>
          <h1 className="text-2xl font-bold text-foreground">How this keeps you safe</h1>
          <p className="mt-2 text-sm text-muted-foreground">Before you continue, here&apos;s what we promise.</p>
        </div>

        <ul className="flex flex-col gap-4">
          {PROMISES.map(({ icon: Icon, text }) => (
            <li key={text} className="flex items-start gap-3">
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-tint">
                <Icon className="h-4 w-4 text-primary" aria-hidden="true" />
              </span>
              <p className="text-sm text-foreground">{text}</p>
            </li>
          ))}
        </ul>

        <Button size="lg" className="w-full" onClick={() => router.push("/onboarding/continue")}>
          Continue
        </Button>
      </div>
    </PublicShell>
  );
}
