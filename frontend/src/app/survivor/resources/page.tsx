"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Compass, Scale, HeartPulse, Home as HomeIcon, GraduationCap } from "lucide-react";
import { Card, CardTitle, CardDescription } from "@/components/ui/card";
import { LoadingState, ErrorState, EmptyState } from "@/components/ui/states";
import { listResources } from "@/lib/api/resources";
import { ApiError } from "@/lib/api/client";
import type { Resource, ResourceCategory } from "@/lib/types";

const CATEGORY_META: Record<ResourceCategory, { label: string; icon: typeof Scale }> = {
  legal: { label: "Legal", icon: Scale },
  medical: { label: "Medical", icon: HeartPulse },
  shelter: { label: "Shelter", icon: HomeIcon },
  educational: { label: "Educational", icon: GraduationCap },
};

export default function ResourcesPage() {
  const [resources, setResources] = useState<Resource[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<ResourceCategory | "all">("all");

  useEffect(() => {
    listResources()
      .then(setResources)
      .catch((e) => setError(e instanceof ApiError ? e.message : "Could not load resources"));
  }, []);

  const filtered = resources?.filter((r) => filter === "all" || r.category === filter) ?? [];

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5 px-4 py-6">
      <div>
        <h1 className="text-xl font-bold text-foreground">Find resources</h1>
        <p className="text-sm text-muted-foreground">Legal, medical, shelter, and educational support.</p>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        <FilterChip active={filter === "all"} onClick={() => setFilter("all")}>
          All
        </FilterChip>
        {(Object.keys(CATEGORY_META) as ResourceCategory[]).map((cat) => (
          <FilterChip key={cat} active={filter === cat} onClick={() => setFilter(cat)}>
            {CATEGORY_META[cat].label}
          </FilterChip>
        ))}
      </div>

      {error && <ErrorState description={error} />}
      {resources === null && !error ? (
        <LoadingState />
      ) : filtered.length === 0 ? (
        <EmptyState icon={Compass} title="No resources in this category yet" />
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map((r) => {
            const Icon = CATEGORY_META[r.category].icon;
            return (
              <Link key={r.id} href={`/survivor/resources/${r.id}`}>
                <Card className="flex items-start gap-3 hover:border-primary/40">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-tint">
                    <Icon className="h-5 w-5 text-primary" aria-hidden="true" />
                  </span>
                  <div>
                    <CardTitle>{r.title}</CardTitle>
                    <CardDescription>{r.summary}</CardDescription>
                    <p className="mt-1 text-xs text-muted-foreground">{r.region}</p>
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={
        "shrink-0 rounded-full border px-3.5 py-1.5 text-sm font-medium " +
        (active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-surface text-muted-foreground")
      }
    >
      {children}
    </button>
  );
}
