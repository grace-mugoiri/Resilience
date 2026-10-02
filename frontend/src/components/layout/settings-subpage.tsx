"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

export function SettingsSubpage({ title, children }: { title: string; children: React.ReactNode }) {
  const router = useRouter();
  return (
    <div className="mx-auto flex max-w-md flex-col gap-5 px-4 py-6">
      <button onClick={() => router.back()} className="flex items-center gap-1 self-start text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back
      </button>
      <h1 className="text-lg font-bold text-foreground">{title}</h1>
      {children}
    </div>
  );
}
