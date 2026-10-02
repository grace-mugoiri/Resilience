"use client";

import { useState } from "react";
import { Bell, Lock } from "lucide-react";
import { SettingsSubpage } from "@/components/layout/settings-subpage";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export default function NotificationsPage() {
  const [discreet, setDiscreet] = useState(true);

  return (
    <SettingsSubpage title="Notifications">
      <Card>
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium text-foreground">Discreet mode</p>
            <p className="mt-0.5 text-sm text-muted-foreground">Hide message content in notifications.</p>
          </div>
          <button
            role="switch"
            aria-checked={discreet}
            onClick={() => setDiscreet((d) => !d)}
            className={cn("h-6 w-11 shrink-0 rounded-full transition-colors", discreet ? "bg-primary" : "bg-border")}
          >
            <span className={cn("block h-5 w-5 translate-y-0.5 rounded-full bg-white transition-transform", discreet ? "translate-x-5" : "translate-x-0.5")} />
          </button>
        </div>
      </Card>

      <div>
        <p className="mb-2 text-sm font-medium text-foreground">Lock screen preview</p>
        <div className="rounded-2xl bg-quick-exit p-4 text-quick-exit-foreground">
          <div className="flex items-center gap-2 rounded-xl bg-white/10 px-3 py-2.5">
            <Lock className="h-4 w-4 shrink-0" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{discreet ? "System Update" : "Resilience"}</p>
              <p className="truncate text-xs opacity-80">
                {discreet ? "You have a new update" : "Grace Wanjiru: How are you feeling today?"}
              </p>
            </div>
            <Bell className="h-4 w-4 shrink-0 opacity-70" aria-hidden="true" />
          </div>
        </div>
      </div>
    </SettingsSubpage>
  );
}
