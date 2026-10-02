import { cn } from "@/lib/utils";

const PALETTE = [
  "#6d28d9", "#0f766e", "#b45309", "#be185d", "#1d4ed8", "#15803d", "#a21caf", "#b91c1c",
];

function colorForSeed(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return PALETTE[hash % PALETTE.length];
}

const sizeClasses = { sm: "h-8 w-8 text-xs", md: "h-10 w-10 text-sm", lg: "h-14 w-14 text-lg" };

export function Avatar({
  seed,
  label,
  size = "md",
  className,
}: {
  seed: string;
  label: string;
  size?: keyof typeof sizeClasses;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white",
        sizeClasses[size],
        className
      )}
      style={{ backgroundColor: colorForSeed(seed) }}
      aria-hidden="true"
    >
      {label.slice(0, 1).toUpperCase()}
    </span>
  );
}
