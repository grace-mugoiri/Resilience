import { AlertCircle, Check, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

export type MessageDeliveryStatus = "sent" | "sending" | "queued" | "failed";

export function MessageBubble({
  body,
  mine,
  status,
  timeLabel,
  onRetry,
}: {
  body: string;
  mine: boolean;
  status?: MessageDeliveryStatus;
  timeLabel?: string;
  onRetry?: () => void;
}) {
  return (
    <div className={cn("flex flex-col", mine ? "items-end" : "items-start")}>
      <div
        className={cn(
          "max-w-[80%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap break-words",
          mine ? "bg-primary text-primary-foreground rounded-br-sm" : "bg-surface-muted text-foreground rounded-bl-sm"
        )}
      >
        {body}
      </div>
      {mine && status && (
        <button
          type="button"
          disabled={status !== "failed"}
          onClick={onRetry}
          className={cn(
            "mt-1 flex items-center gap-1 text-xs",
            status === "failed" ? "text-danger" : "text-muted-foreground",
            status === "failed" && "cursor-pointer hover:underline"
          )}
        >
          {status === "sending" || status === "queued" ? (
            <Clock className="h-3 w-3" aria-hidden="true" />
          ) : status === "failed" ? (
            <AlertCircle className="h-3 w-3" aria-hidden="true" />
          ) : (
            <Check className="h-3 w-3" aria-hidden="true" />
          )}
          {status === "sending" && "Sending…"}
          {status === "queued" && "Waiting for connection"}
          {status === "failed" && "Failed — tap to retry"}
          {status === "sent" && timeLabel}
        </button>
      )}
      {!mine && timeLabel && <span className="mt-1 text-xs text-muted-foreground">{timeLabel}</span>}
    </div>
  );
}
