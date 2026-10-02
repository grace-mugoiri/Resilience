"use client";

import { useRouter } from "next/navigation";
import { Phone, ArrowLeft } from "lucide-react";
import { PublicShell } from "@/components/layout/public-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

const EMERGENCY_CONTACTS = [
  { label: "Police emergency line", number: "999" },
  { label: "National GBV helpline", number: "1195" },
];

export default function EmergencyPage() {
  const router = useRouter();

  return (
    <PublicShell>
      <button
        onClick={() => router.back()}
        className="mt-4 flex items-center gap-1 self-start text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back
      </button>

      <div className="mt-6 flex flex-col gap-6">
        <div>
          <h1 className="text-xl font-bold text-foreground">Get help right now</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            If you&apos;re in immediate danger, please call one of these numbers directly.
          </p>
        </div>

        <div className="flex flex-col gap-3">
          {EMERGENCY_CONTACTS.map((c) => (
            <Card key={c.number} className="flex items-center justify-between">
              <div>
                <p className="font-semibold text-foreground">{c.label}</p>
                <p className="text-sm text-muted-foreground">{c.number}</p>
              </div>
              <Button onClick={() => window.location.assign(`tel:${c.number}`)}>
                <Phone className="h-4 w-4" aria-hidden="true" /> Call
              </Button>
            </Card>
          ))}
        </div>

        <p className="text-xs text-muted-foreground">
          These are example contact numbers for this prototype and have not been verified — a real deployment
          must confirm current local emergency numbers before launch.
        </p>

        <Button variant="secondary" onClick={() => router.push("/onboarding/promise")}>
          I&apos;m safe now — continue
        </Button>
      </div>
    </PublicShell>
  );
}
