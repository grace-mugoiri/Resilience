import { type ButtonHTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "link";
type Size = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

const variantClasses: Record<Variant, string> = {
  primary:
    "bg-primary text-primary-foreground hover:bg-primary-hover disabled:opacity-50",
  secondary:
    "bg-transparent text-primary border border-primary hover:bg-primary-tint disabled:opacity-50",
  ghost: "bg-transparent text-foreground hover:bg-surface-muted disabled:opacity-50",
  danger: "bg-danger text-white hover:opacity-90 disabled:opacity-50",
  link: "bg-transparent text-primary underline-offset-4 hover:underline p-0 h-auto",
};

const sizeClasses: Record<Size, string> = {
  sm: "h-9 px-3 text-sm rounded-full",
  md: "h-11 px-5 text-sm rounded-full",
  lg: "h-13 px-6 text-base rounded-full",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center gap-2 font-medium transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          "disabled:pointer-events-none",
          variant !== "link" && sizeClasses[size],
          variantClasses[variant],
          className
        )}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";
