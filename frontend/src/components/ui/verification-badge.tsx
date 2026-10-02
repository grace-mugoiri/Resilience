import { CheckCircle2, CircleX, Clock, HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { VerificationStatus } from "@/lib/types";

const CONFIG: Record<
  VerificationStatus,
  { icon: typeof CheckCircle2; className: string; label: (org: string) => string }
> = {
  verified: {
    icon: CheckCircle2,
    className: "text-success",
    label: (org) => (org ? `Verified by ${org}` : "Verified"),
  },
  pending: {
    icon: HelpCircle,
    className: "text-muted-foreground",
    label: () => "Verification pending",
  },
  expired: {
    icon: Clock,
    className: "text-warning",
    label: () => "Verification expired",
  },
  revoked: {
    icon: CircleX,
    className: "text-danger",
    label: () => "Verification removed",
  },
};

export function VerificationBadge({
  status,
  organization = "",
  className,
}: {
  status: VerificationStatus;
  organization?: string;
  className?: string;
}) {
  const { icon: Icon, className: colorClass, label } = CONFIG[status];
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-sm font-medium", colorClass, className)}>
      <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
      {label(organization)}
    </span>
  );
}
