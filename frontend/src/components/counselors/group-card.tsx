import Link from "next/link";
import { Users } from "lucide-react";
import { Card } from "@/components/ui/card";
import type { Group } from "@/lib/types";

export function GroupCard({ group }: { group: Group }) {
  return (
    <Link href={`/survivor/support/groups/${group.id}`}>
      <Card className="hover:border-primary/40">
        <div className="flex items-center justify-between">
          <p className="font-semibold text-foreground">{group.name}</p>
          {group.is_member && (
            <span className="rounded-full bg-success-tint px-2 py-0.5 text-xs font-medium text-success">Joined</span>
          )}
        </div>
        <p className="mt-1 text-sm text-muted-foreground">{group.description}</p>
        <div className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Users className="h-3.5 w-3.5" aria-hidden="true" />
          {group.member_count} members · Facilitated by {group.facilitator_name}
        </div>
      </Card>
    </Link>
  );
}
