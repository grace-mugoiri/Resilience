"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PublicShell } from "@/components/layout/public-shell";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/input";
import { createCounselorProfile } from "@/lib/api/counselors";
import { ApiError } from "@/lib/api/client";
import { useSession } from "@/lib/context/session-context";

export default function CounselorProfileSetupPage() {
  const router = useRouter();
  const { identity } = useSession();
  const [bio, setBio] = useState("");
  const [specialties, setSpecialties] = useState("");
  const [languages, setLanguages] = useState("");
  const [organization, setOrganization] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await createCounselorProfile({
        display_name: identity?.pseudonym ?? "Counselor",
        bio,
        specialties: specialties.split(",").map((s) => s.trim()).filter(Boolean),
        languages: languages.split(",").map((s) => s.trim()).filter(Boolean),
        attesting_organization: organization,
      });
      router.push("/counselor");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save your profile");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <PublicShell showExit={false}>
      <div className="flex flex-1 flex-col justify-center gap-6 py-8">
        <div>
          <h1 className="text-xl font-bold text-foreground">Set up your profile</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            This is what survivors see when browsing counselors. Your verification status starts as{" "}
            <strong>pending</strong> until an external organization attests to it.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Field label="About you" htmlFor="bio" hint="A short, warm introduction.">
            <Textarea id="bio" value={bio} onChange={(e) => setBio(e.target.value)} rows={3} required />
          </Field>
          <Field label="Specialties" htmlFor="specialties" hint="Comma-separated, e.g. Trauma-informed counseling, Crisis support">
            <Input id="specialties" value={specialties} onChange={(e) => setSpecialties(e.target.value)} />
          </Field>
          <Field label="Languages" htmlFor="languages" hint="Comma-separated, e.g. English, Swahili">
            <Input id="languages" value={languages} onChange={(e) => setLanguages(e.target.value)} />
          </Field>
          <Field label="Attesting organization" htmlFor="organization" hint="Who can vouch for your credentials?">
            <Input id="organization" value={organization} onChange={(e) => setOrganization(e.target.value)} placeholder="e.g. African Trauma Counselors Network" />
          </Field>
          {error && <p className="text-sm text-danger">{error}</p>}
          <Button type="submit" disabled={submitting}>
            Save profile
          </Button>
        </form>
      </div>
    </PublicShell>
  );
}
