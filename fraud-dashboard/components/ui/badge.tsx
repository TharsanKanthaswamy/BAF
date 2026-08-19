import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * A tinted chip: wash fill + hairline ring, never a saturated block.
 * Status variants always render an icon alongside the label — colour alone
 * never carries the meaning.
 */
function Badge({
  className,
  variant = "neutral",
  size = "default",
  ...props
}: React.ComponentProps<"span"> & {
  variant?: "neutral" | "outline" | "series" | "solid";
  size?: "default" | "sm";
}) {
  return (
    <span
      data-slot="badge"
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full ring-1 ring-inset font-medium whitespace-nowrap",
        "[&_svg]:pointer-events-none [&_svg]:shrink-0",
        size === "sm"
          ? "px-1.5 py-px text-subheadline [&_svg:not([class*='size-'])]:size-2.5"
          : "px-2 py-0.5 text-callout [&_svg:not([class*='size-'])]:size-3",
        variant === "neutral" && "bg-muted text-muted-foreground ring-border",
        variant === "outline" && "bg-transparent text-muted-foreground ring-input",
        variant === "series" &&
          "bg-[color-mix(in_oklab,var(--chart-1)_12%,transparent)] text-[color-mix(in_oklab,var(--chart-1)_88%,var(--foreground))] ring-[color-mix(in_oklab,var(--chart-1)_28%,transparent)]",
        variant === "solid" && "bg-primary text-primary-foreground ring-transparent",
        className
      )}
      {...props}
    />
  );
}

export { Badge };
