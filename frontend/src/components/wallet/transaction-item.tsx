import { ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { StatusDot } from "@/components/ui/states";
import { formatSats, formatRelativeTime } from "@/lib/utils";
import type { Transaction } from "@/lib/types";

const STATUS_TONE = { pending: "warning", success: "success", failed: "danger" } as const;
const STATUS_LABEL = { pending: "Pending", success: "Received", failed: "Failed" } as const;

export function TransactionItem({ tx }: { tx: Transaction }) {
  const incoming = tx.direction === "incoming";
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-muted">
        {incoming ? (
          <ArrowDownLeft className="h-4 w-4 text-success" aria-hidden="true" />
        ) : (
          <ArrowUpRight className="h-4 w-4 text-foreground" aria-hidden="true" />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-foreground">{tx.counterparty_label || (incoming ? "Support received" : "Withdrawal")}</p>
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <StatusDot tone={STATUS_TONE[tx.status]} />
          {STATUS_LABEL[tx.status]} · {formatRelativeTime(tx.created_at)}
        </p>
      </div>
      <span className={"shrink-0 font-semibold " + (incoming ? "text-success" : "text-foreground")}>
        {incoming ? "+" : "-"}
        {formatSats(tx.amount_sats)}
      </span>
    </div>
  );
}
