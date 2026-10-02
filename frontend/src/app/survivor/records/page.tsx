"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { FileHeart, Plus } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LoadingState, ErrorState, EmptyState } from "@/components/ui/states";
import { AccountGate } from "@/components/onboarding/account-gate";
import { listHealthRecords } from "@/lib/api/health";
import { ApiError } from "@/lib/api/client";
import { formatRelativeTime } from "@/lib/utils";
import type { HealthRecord } from "@/lib/types";

export default function RecordsPage() {
  const [records, setRecords] = useState<HealthRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listHealthRecords()
      .then(setRecords)
      .catch((e) => setError(e instanceof ApiError ? e.message : "Could not load your records"));
  }, []);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5 px-4 py-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">My records</h1>
          <p className="text-sm text-muted-foreground">Private notes only you control.</p>
        </div>
        <Link href="/survivor/records/new">
          <Button size="sm">
            <Plus className="h-4 w-4" aria-hidden="true" /> New note
          </Button>
        </Link>
      </div>

      <AccountGate feature="My records">
        {error && <ErrorState description={error} />}
        {records === null && !error ? (
          <LoadingState />
        ) : records!.length === 0 ? (
          <EmptyState icon={FileHeart} title="No records yet" description="Saved only on this device." />
        ) : (
          <div className="flex flex-col gap-3">
            {records!.map((r) => (
              <Link key={r.id} href={`/survivor/records/${r.id}`}>
                <Card className="hover:border-primary/40">
                  <p className="font-semibold text-foreground">{r.title}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {r.record_type} · {formatRelativeTime(r.created_at)}
                  </p>
                  {r.shared_with.length > 0 && (
                    <p className="mt-1 text-xs text-primary">
                      Shared with {r.shared_with.map((s) => s.pseudonym).join(", ")}
                    </p>
                  )}
                </Card>
              </Link>
            ))}
          </div>
        )}
      </AccountGate>
    </div>
  );
}
