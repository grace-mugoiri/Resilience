"use client";

import { useEffect, useState } from "react";
import { HeartHandshake } from "lucide-react";
import { SegmentedToggle } from "@/components/ui/segmented-toggle";
import { LoadingState, ErrorState, EmptyState } from "@/components/ui/states";
import { CounselorCard } from "@/components/counselors/counselor-card";
import { GroupCard } from "@/components/counselors/group-card";
import { useSession } from "@/lib/context/session-context";
import { listCounselors } from "@/lib/api/counselors";
import { listGroups } from "@/lib/api/groups";
import { ApiError } from "@/lib/api/client";
import type { CounselorProfile, Group } from "@/lib/types";

export default function SupportDirectoryPage() {
  const { identity } = useSession();
  const [tab, setTab] = useState<"counselors" | "groups">("counselors");
  const [counselors, setCounselors] = useState<CounselorProfile[] | null>(null);
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
    if (tab === "counselors" && counselors === null) {
      listCounselors()
        .then(setCounselors)
        .catch((e) => setError(e instanceof ApiError ? e.message : "Could not load counselors"));
    }
    if (tab === "groups" && groups === null && identity) {
      listGroups()
        .then(setGroups)
        .catch((e) => setError(e instanceof ApiError ? e.message : "Could not load groups"));
    }
  }, [tab, counselors, groups, identity]);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5 px-4 py-6">
      <div>
        <h1 className="text-xl font-bold text-foreground">Talk to someone</h1>
        <p className="text-sm text-muted-foreground">Connect one-to-one with a counselor, or join a peer group.</p>
      </div>

      <SegmentedToggle
        value={tab}
        onChange={setTab}
        options={[
          { value: "counselors", label: "One-to-one" },
          { value: "groups", label: "Groups" },
        ]}
      />

      {error && <ErrorState description={error} />}

      {tab === "counselors" &&
        (counselors === null ? (
          <LoadingState />
        ) : counselors.length === 0 ? (
          <EmptyState icon={HeartHandshake} title="No counselors available yet" />
        ) : (
          <div className="flex flex-col gap-3">
            {counselors.map((c) => (
              <CounselorCard key={c.id} counselor={c} />
            ))}
          </div>
        ))}

      {tab === "groups" &&
        (!identity ? (
          <EmptyState
            icon={HeartHandshake}
            title="Create an account to join groups"
            description="Group membership is tied to your pseudonymous account."
          />
        ) : groups === null ? (
          <LoadingState />
        ) : groups.length === 0 ? (
          <EmptyState icon={HeartHandshake} title="No groups available yet" />
        ) : (
          <div className="flex flex-col gap-3">
            {groups.map((g) => (
              <GroupCard key={g.id} group={g} />
            ))}
          </div>
        ))}
    </div>
  );
}
