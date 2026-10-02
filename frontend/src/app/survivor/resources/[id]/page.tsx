"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LoadingState, ErrorState } from "@/components/ui/states";
import { listResources } from "@/lib/api/resources";
import { ApiError } from "@/lib/api/client";
import type { Resource } from "@/lib/types";

export default function ResourceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [resource, setResource] = useState<Resource | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listResources()
      .then((all) => {
        const found = all.find((r) => r.id === id);
        if (!found) {
          setError("Resource not found");
          return;
        }
        setResource(found);
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : "Could not load this resource"));
  }, [id]);

  if (error) return <ErrorState description={error} />;
  if (!resource) return <LoadingState />;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5 px-4 py-6">
      <button onClick={() => router.back()} className="flex items-center gap-1 self-start text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back
      </button>

      <div>
        <span className="rounded-full bg-primary-tint px-2.5 py-1 text-xs font-medium capitalize text-primary">
          {resource.category}
        </span>
        <h1 className="mt-2 text-xl font-bold text-foreground">{resource.title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{resource.region}</p>
      </div>

      <p className="text-sm text-foreground">{resource.summary}</p>

      {resource.contact && (
        <Button className="w-full" onClick={() => window.location.assign(`tel:${resource.contact.split(" ")[0]}`)}>
          <Phone className="h-4 w-4" aria-hidden="true" /> {resource.contact}
        </Button>
      )}

      {resource.is_demo_data && (
        <p className="text-xs text-muted-foreground">
          This is example data for the prototype and does not represent a real organization.
        </p>
      )}
    </div>
  );
}
