"use client";

import { useEffect, useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { VerificationBadge } from "@/components/ui/verification-badge";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Textarea, Input } from "@/components/ui/input";
import { LoadingState, ErrorState } from "@/components/ui/states";
import { useSession } from "@/lib/context/session-context";
import { listCounselors, updateCounselorProfile } from "@/lib/api/counselors";
import { ApiError } from "@/lib/api/client";
import { cn } from "@/lib/utils";
import type { CounselorProfile } from "@/lib/types";

export default function CounselorProfilePage() {
  const { identity } = useSession();
  const [profile, setProfile] = useState<CounselorProfile | null>(null);
  const [bio, setBio] = useState("");
  const [specialties, setSpecialties] = useState("");
  const [languages, setLanguages] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!identity) return;
    listCounselors()
      .then((all) => {
        const mine = all.find((c) => c.identity_id === identity.id);
        if (!mine) {
          setError("Profile not found");
          return;
        }
        setProfile(mine);
        setBio(mine.bio);
        setSpecialties(mine.specialties.join(", "));
        setLanguages(mine.languages.join(", "));
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : "Could not load your profile"));
  }, [identity]);

  async function handleSave() {
    if (!profile) return;
    setSaving(true);
    setSaved(false);
    try {
      const updated = await updateCounselorProfile(profile.id, {
        bio,
        specialties: specialties.split(",").map((s) => s.trim()).filter(Boolean),
        languages: languages.split(",").map((s) => s.trim()).filter(Boolean),
      });
      setProfile(updated);
      setSaved(true);
    } finally {
      setSaving(false);
    }
  }

  async function toggleAvailability() {
    if (!profile) return;
    const updated = await updateCounselorProfile(profile.id, { is_available: !profile.is_available });
    setProfile(updated);
  }

  if (error) return <ErrorState description={error} />;
  if (!profile) return <LoadingState />;

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-5 px-4 py-6">
      <div className="flex items-center gap-4">
        <Avatar seed={profile.identity_id} label={profile.display_name} size="lg" />
        <div>
          <h1 className="text-lg font-bold text-foreground">{profile.display_name}</h1>
          <VerificationBadge status={profile.verification_status} organization={profile.attesting_organization} />
        </div>
      </div>

      <Card className="flex items-center justify-between">
        <div>
          <p className="font-medium text-foreground">Available for new conversations</p>
          <p className="text-sm text-muted-foreground">Turn off if you need a break.</p>
        </div>
        <button
          role="switch"
          aria-checked={profile.is_available}
          onClick={toggleAvailability}
          className={cn("h-6 w-11 shrink-0 rounded-full transition-colors", profile.is_available ? "bg-primary" : "bg-border")}
        >
          <span className={cn("block h-5 w-5 translate-y-0.5 rounded-full bg-white transition-transform", profile.is_available ? "translate-x-5" : "translate-x-0.5")} />
        </button>
      </Card>

      <div className="flex flex-col gap-4">
        <Field label="About you" htmlFor="bio">
          <Textarea id="bio" value={bio} onChange={(e) => setBio(e.target.value)} rows={3} />
        </Field>
        <Field label="Specialties" htmlFor="specialties" hint="Comma-separated">
          <Input id="specialties" value={specialties} onChange={(e) => setSpecialties(e.target.value)} />
        </Field>
        <Field label="Languages" htmlFor="languages" hint="Comma-separated">
          <Input id="languages" value={languages} onChange={(e) => setLanguages(e.target.value)} />
        </Field>
        <Button disabled={saving} onClick={handleSave}>
          Save changes
        </Button>
        {saved && <p className="text-center text-sm text-success">Saved.</p>}
      </div>
    </div>
  );
}
