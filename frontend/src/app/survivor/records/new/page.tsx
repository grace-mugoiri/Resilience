"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/input";
import { createHealthRecord } from "@/lib/api/health";
import { ApiError } from "@/lib/api/client";
import { cn } from "@/lib/utils";

const TRIMESTERS = ["1st trimester", "2nd trimester", "3rd trimester", "Prefer not to say"];

export default function NewRecordPage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [trimester, setTrimester] = useState<string | null>(null);
  const [symptoms, setSymptoms] = useState("");
  const [medication, setMedication] = useState("");
  const [dosage, setDosage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const bodyLines = [
      `Date: ${date}`,
      trimester ? `Trimester: ${trimester}` : null,
      symptoms ? `Symptoms/notes: ${symptoms}` : null,
      medication ? `Medication: ${medication}${dosage ? ` (${dosage})` : ""}` : null,
    ].filter(Boolean);
    try {
      await createHealthRecord({
        record_type: "clinic_note",
        title: title.trim() || "Untitled note",
        body: bodyLines.join("\n"),
      });
      router.push("/survivor/records");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save this note");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-md flex-col gap-5 px-4 py-6">
      <button onClick={() => router.back()} className="flex items-center gap-1 self-start text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back
      </button>

      <h1 className="text-lg font-bold text-foreground">New note</h1>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Field label="Title" htmlFor="title">
          <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Clinic visit" required />
        </Field>

        <Field label="Date" htmlFor="date">
          <Input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>

        <div>
          <p className="mb-2 text-sm font-medium text-foreground">Trimester (optional)</p>
          <div className="flex flex-wrap gap-2">
            {TRIMESTERS.map((t) => (
              <button
                type="button"
                key={t}
                onClick={() => setTrimester(trimester === t ? null : t)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-sm",
                  trimester === t ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground"
                )}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        <Field label="Symptoms or notes" htmlFor="symptoms">
          <Textarea id="symptoms" value={symptoms} onChange={(e) => setSymptoms(e.target.value)} rows={3} />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Medication" htmlFor="medication">
            <Input id="medication" value={medication} onChange={(e) => setMedication(e.target.value)} />
          </Field>
          <Field label="Dosage" htmlFor="dosage">
            <Input id="dosage" value={dosage} onChange={(e) => setDosage(e.target.value)} />
          </Field>
        </div>

        {error && <p className="text-sm text-danger">{error}</p>}
        <Button type="submit" disabled={submitting}>
          Save note
        </Button>
        <p className="text-center text-xs text-muted-foreground">
          Saved to your account. See Settings for how this is protected in the current prototype.
        </p>
      </form>
    </div>
  );
}
