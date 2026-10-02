"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { LoadingState, ErrorState } from "@/components/ui/states";
import { listHealthRecords, shareHealthRecord, revokeHealthShare } from "@/lib/api/health";
import { listCounselors } from "@/lib/api/counselors";
import { ApiError } from "@/lib/api/client";
import type { CounselorProfile, HealthRecord } from "@/lib/types";

export default function RecordDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [record, setRecord] = useState<HealthRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [verifiedCounselors, setVerifiedCounselors] = useState<CounselorProfile[]>([]);
  const [selectedCounselor, setSelectedCounselor] = useState<string>("");
  const [purpose, setPurpose] = useState<"care" | "referral">("care");
  const [agreed, setAgreed] = useState(false);
  const [stopSharingTarget, setStopSharingTarget] = useState<{ shareId: string; pseudonym: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () =>
    listHealthRecords()
      .then((all) => {
        const found = all.find((r) => r.id === id);
        if (!found) setError("Record not found");
        else setRecord(found);
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : "Could not load this record"));

  useEffect(() => {
    load();
    listCounselors("verified").then(setVerifiedCounselors);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function handleShare() {
    setBusy(true);
    try {
      await shareHealthRecord(id, selectedCounselor);
      setShareOpen(false);
      setAgreed(false);
      setSelectedCounselor("");
      load();
    } finally {
      setBusy(false);
    }
  }

  async function confirmStopSharing() {
    if (!stopSharingTarget) return;
    setBusy(true);
    try {
      await revokeHealthShare(stopSharingTarget.shareId);
      setStopSharingTarget(null);
      load();
    } finally {
      setBusy(false);
    }
  }

  if (error) return <ErrorState description={error} />;
  if (!record) return <LoadingState />;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5 px-4 py-6">
      <button onClick={() => router.back()} className="flex items-center gap-1 self-start text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back
      </button>

      <div>
        <h1 className="text-xl font-bold text-foreground">{record.title}</h1>
        <p className="text-xs text-muted-foreground">{record.record_type}</p>
      </div>

      <Card>
        <p className="whitespace-pre-wrap text-sm text-foreground">{record.body || "No additional details."}</p>
      </Card>

      <Card>
        <div className="flex items-center justify-between">
          <p className="font-semibold text-foreground">Sharing</p>
          <Button size="sm" variant="secondary" onClick={() => setShareOpen(true)}>
            <Share2 className="h-4 w-4" aria-hidden="true" /> Share
          </Button>
        </div>
        {record.shared_with.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">Not shared with anyone.</p>
        ) : (
          <div className="mt-3 flex flex-col gap-2">
            {record.shared_with.map((share) => (
              <div key={share.share_id} className="flex items-center justify-between rounded-lg bg-surface-muted px-3 py-2">
                <span className="text-sm text-foreground">{share.pseudonym}</span>
                <button
                  onClick={() => setStopSharingTarget({ shareId: share.share_id, pseudonym: share.pseudonym })}
                  className="text-sm font-medium text-danger hover:underline"
                >
                  Stop sharing
                </button>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Modal open={shareOpen} onClose={() => setShareOpen(false)} title="Share this note">
        <p className="mb-3 text-sm text-muted-foreground">
          Only verified counselors can be selected. They will see the title and content of this note.
        </p>
        <select
          value={selectedCounselor}
          onChange={(e) => setSelectedCounselor(e.target.value)}
          className="mb-3 h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm"
        >
          <option value="">Choose a counselor…</option>
          {verifiedCounselors.map((c) => (
            <option key={c.identity_id} value={c.identity_id}>
              {c.display_name}
            </option>
          ))}
        </select>

        <p className="mb-2 text-sm font-medium text-foreground">Why are you sharing?</p>
        <div className="mb-3 flex gap-2">
          {(["care", "referral"] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPurpose(p)}
              className={
                "flex-1 rounded-full border px-3 py-1.5 text-sm " +
                (purpose === p ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground")
              }
            >
              {p === "care" ? "For my care" : "For a referral"}
            </button>
          ))}
        </div>

        <label className="mb-4 flex items-start gap-2 text-sm text-foreground">
          <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-0.5 accent-[var(--color-primary)]" />
          I agree to share this note with the selected counselor.
        </label>

        <Button className="w-full" disabled={!agreed || !selectedCounselor || busy} onClick={handleShare}>
          Share note
        </Button>
      </Modal>

      <Modal
        open={!!stopSharingTarget}
        onClose={() => setStopSharingTarget(null)}
        title={`Stop sharing with ${stopSharingTarget?.pseudonym}?`}
      >
        <p className="mb-4 text-sm text-muted-foreground">
          This stops future access. Anything {stopSharingTarget?.pseudonym} has already opened can&apos;t be recalled.
        </p>
        <div className="flex flex-col gap-2">
          <Button variant="danger" disabled={busy} onClick={confirmStopSharing}>
            Stop sharing
          </Button>
          <Button variant="ghost" onClick={() => setStopSharingTarget(null)}>
            Keep sharing
          </Button>
        </div>
      </Modal>
    </div>
  );
}
