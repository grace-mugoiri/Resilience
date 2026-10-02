"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AlertTriangle, HeartHandshake, Users, Compass, Wallet, FileHeart, ShieldCheck } from "lucide-react";
import { Card, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useSession } from "@/lib/context/session-context";

const HOME_CARDS = [
  { href: "/survivor/support", icon: HeartHandshake, title: "Talk to someone", description: "Counselors and peer support groups." },
  { href: "/survivor/circle", icon: Users, title: "My circle", description: "Message the people you trust." },
  { href: "/survivor/resources", icon: Compass, title: "Find resources", description: "Legal, medical, and shelter support near you." },
  { href: "/survivor/wallet", icon: Wallet, title: "My wallet", description: "Support sent to you, safely." },
  { href: "/survivor/records", icon: FileHeart, title: "My records", description: "Private notes only you control." },
];

export default function SurvivorHomePage() {
  const { identity } = useSession();
  const router = useRouter();
  const [recoveryPhrase, setRecoveryPhrase] = useState<string | null>(null);

  useEffect(() => {
    if (!identity) return;
    const alreadyBackedUp = window.localStorage.getItem(`resilience.backed_up.${identity.id}`) === "1";
    if (!alreadyBackedUp) {
      setRecoveryPhrase(window.sessionStorage.getItem(`resilience.recovery.${identity.id}`));
    }
  }, [identity]);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-6">
      <div>
        <h1 className="text-xl font-bold text-foreground">
          {identity ? `Hi, ${identity.pseudonym}` : "Welcome"}
        </h1>
        <p className="text-sm text-muted-foreground">
          {identity ? "This space is private to you." : "You're browsing without an account."}
        </p>
      </div>

      <Link href="/emergency">
        <Card className="border-danger/30 bg-danger-tint hover:bg-danger-tint/80">
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 shrink-0 text-danger" aria-hidden="true" />
            <div>
              <p className="font-semibold text-danger">In danger right now?</p>
              <p className="text-sm text-danger/80">Get emergency contacts immediately.</p>
            </div>
          </div>
        </Card>
      </Link>

      {!identity && (
        <Card className="border-primary/30 bg-primary-tint">
          <div className="flex items-center gap-3">
            <ShieldCheck className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
            <div className="flex-1">
              <p className="font-semibold text-foreground">Create an account for full access</p>
              <p className="text-sm text-muted-foreground">
                Messaging, wallet, circle, and records need a pseudonymous account.
              </p>
            </div>
          </div>
          <Button size="sm" className="mt-3" onClick={() => router.push("/onboarding/create")}>
            Create account
          </Button>
        </Card>
      )}

      {identity && recoveryPhrase && (
        <Card className="border-warning/30 bg-warning-tint">
          <p className="font-semibold text-foreground">Back up your account</p>
          <p className="mt-1 text-sm text-muted-foreground">
            You haven&apos;t saved your backup words yet. Without them, losing this device means losing access.
          </p>
          <Link href="/survivor/settings/backup" className="mt-2 inline-block text-sm font-medium text-primary hover:underline">
            Back up now
          </Link>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {HOME_CARDS.map(({ href, icon: Icon, title, description }) => (
          <Link key={href} href={href}>
            <Card className="h-full transition-colors hover:border-primary/40">
              <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-primary-tint">
                <Icon className="h-5 w-5 text-primary" aria-hidden="true" />
              </span>
              <CardTitle>{title}</CardTitle>
              <CardDescription>{description}</CardDescription>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
