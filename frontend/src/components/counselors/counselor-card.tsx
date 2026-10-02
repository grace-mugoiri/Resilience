import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { VerificationBadge } from "@/components/ui/verification-badge";
import type { CounselorProfile } from "@/lib/types";

export function CounselorCard({ counselor }: { counselor: CounselorProfile }) {
  return (
    <Link href={`/survivor/support/counselors/${counselor.id}`}>
      <Card className="flex items-start gap-3 hover:border-primary/40">
        <Avatar seed={counselor.identity_id} label={counselor.display_name} size="lg" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-foreground">{counselor.display_name}</p>
          <VerificationBadge
            status={counselor.verification_status}
            organization={counselor.attesting_organization}
            className="mt-0.5"
          />
          {counselor.specialties.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {counselor.specialties.slice(0, 3).map((s) => (
                <span key={s} className="rounded-full bg-surface-muted px-2.5 py-1 text-xs text-muted-foreground">
                  {s}
                </span>
              ))}
            </div>
          )}
        </div>
      </Card>
    </Link>
  );
}
