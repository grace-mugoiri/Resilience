import { AlertTriangle, Loader2, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border px-6 py-12 text-center">
      {Icon && <Icon className="h-8 w-8 text-muted-foreground" aria-hidden="true" />}
      <p className="font-medium text-foreground">{title}</p>
      {description && <p className="max-w-sm text-sm text-muted-foreground">{description}</p>}
      {action}
    </div>
  );
}

export function LoadingState({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground" role="status">
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
      {label}
    </div>
  );
}

export function ErrorState({
  title = "Something went wrong",
  description,
  onRetry,
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
}) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center gap-2 rounded-2xl border border-danger/30 bg-danger-tint px-6 py-10 text-center"
    >
      <AlertTriangle className="h-6 w-6 text-danger" aria-hidden="true" />
      <p className="font-medium text-foreground">{title}</p>
      {description && <p className="max-w-sm text-sm text-muted-foreground">{description}</p>}
      {onRetry && (
        <button onClick={onRetry} className="mt-1 text-sm font-medium text-primary hover:underline">
          Try again
        </button>
      )}
    </div>
  );
}

const DOT_CLASSES = {
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  neutral: "bg-muted-foreground",
};

export function StatusDot({ tone, className }: { tone: keyof typeof DOT_CLASSES; className?: string }) {
  return <span className={cn("inline-block h-2 w-2 rounded-full", DOT_CLASSES[tone], className)} aria-hidden="true" />;
}
