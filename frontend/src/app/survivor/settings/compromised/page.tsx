"use client";

import Link from "next/link";
import { AlertTriangle, KeyRound, MessageCircleWarning, RefreshCw } from "lucide-react";
import { SettingsSubpage } from "@/components/layout/settings-subpage";
import { Card } from "@/components/ui/card";

const ACTIONS = [
  {
    icon: KeyRound,
    title: "Change your PIN now",
    description: "If someone may have seen your PIN, change it immediately.",
    href: "/survivor/settings/pin",
  },
  {
    icon: RefreshCw,
    title: "Start a new account",
    description: "Your circle and conversations won't transfer to the new account.",
    href: "/onboarding/create",
  },
  {
    icon: MessageCircleWarning,
    title: "Tell your counselor",
    description: "They can help you think through next steps safely.",
    href: "/survivor/messages",
  },
];

export default function CompromisedAccountPage() {
  return (
    <SettingsSubpage title="My account may be compromised">
      <div className="flex items-start gap-2 rounded-xl bg-danger-tint p-3 text-sm text-danger">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        Messages you&apos;ve already sent can&apos;t be taken back.
      </div>

      <div className="flex flex-col gap-3">
        {ACTIONS.map(({ icon: Icon, title, description, href }, i) => (
          <Link key={href} href={href}>
            <Card className="flex items-start gap-3 hover:border-primary/40">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-tint text-sm font-semibold text-primary">
                {i + 1}
              </span>
              <div>
                <p className="flex items-center gap-1.5 font-semibold text-foreground">
                  <Icon className="h-4 w-4" aria-hidden="true" /> {title}
                </p>
                <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </SettingsSubpage>
  );
}
