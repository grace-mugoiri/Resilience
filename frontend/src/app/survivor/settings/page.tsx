"use client";

import Link from "next/link";
import { ChevronRight, ShieldQuestion, BellOff, KeyRound, Fingerprint, LifeBuoy, ShieldAlert, Trash2 } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { useSession } from "@/lib/context/session-context";

const LINKS = [
  { href: "/survivor/settings/privacy", icon: ShieldQuestion, label: "How your privacy works" },
  { href: "/survivor/settings/notifications", icon: BellOff, label: "Notifications" },
  { href: "/survivor/settings/pin", icon: KeyRound, label: "Change PIN" },
  { href: "/survivor/settings/backup-id", icon: Fingerprint, label: "Your backup ID" },
  { href: "/survivor/settings/backup", icon: LifeBuoy, label: "Backup your account" },
  { href: "/survivor/settings/compromised", icon: ShieldAlert, label: "My account may be compromised" },
  { href: "/survivor/settings/clear-data", icon: Trash2, label: "Clear everything", danger: true },
];

export default function SettingsPage() {
  const { identity } = useSession();

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5 px-4 py-6">
      <h1 className="text-xl font-bold text-foreground">Settings</h1>

      {identity && (
        <div className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-4">
          <Avatar seed={identity.avatar_seed} label={identity.pseudonym} size="lg" />
          <div>
            <p className="font-semibold text-foreground">{identity.pseudonym}</p>
            <p className="text-xs text-muted-foreground">Pseudonymous account</p>
          </div>
        </div>
      )}

      <div className="flex flex-col divide-y divide-border rounded-2xl border border-border bg-surface">
        {LINKS.map(({ href, icon: Icon, label, danger }) => (
          <Link key={href} href={href} className="flex items-center gap-3 px-4 py-3.5 hover:bg-surface-muted">
            <Icon className={"h-5 w-5 " + (danger ? "text-danger" : "text-muted-foreground")} aria-hidden="true" />
            <span className={"flex-1 text-sm font-medium " + (danger ? "text-danger" : "text-foreground")}>{label}</span>
            <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          </Link>
        ))}
      </div>
    </div>
  );
}
