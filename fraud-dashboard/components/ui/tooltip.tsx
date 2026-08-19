"use client";

import * as React from "react";
import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip";

import { cn } from "@/lib/utils";

const TooltipProvider = TooltipPrimitive.Provider;

/**
 * Hover affordances are gated to fine pointers — a touch device has no hover,
 * so a tooltip there is a trap. `@media (hover: hover)` on the popup keeps the
 * accessible name (the trigger's own aria-label) as the only touch path.
 */
function Tooltip({
  content,
  children,
  side = "top",
  className,
  delay = 350,
}: {
  content: React.ReactNode;
  children: React.ReactNode;
  side?: "top" | "bottom" | "left" | "right";
  className?: string;
  delay?: number;
}) {
  if (!content) return <>{children}</>;

  return (
    // `delay` lives on the trigger (or the provider), not the root — the root
    // only owns open state.
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger
        delay={delay}
        render={children as React.ReactElement}
      />
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Positioner
          side={side}
          sideOffset={8}
          className="z-50 outline-none"
        >
          <TooltipPrimitive.Popup
            className={cn(
              // Glass earns its place here: a tooltip floats over live content,
              // so there is genuinely something behind it to refract. Blur and
              // shadow are dialled down to tooltip scale.
              "material-floating max-w-[18rem] rounded-xl px-2.5 py-1.5",
              "text-callout leading-snug text-popover-foreground",
              "[--glass-blur:18px] [--glass-shadow:var(--shadow-raised)]",
              "origin-[var(--transform-origin)] transition-[opacity,transform,scale] duration-150 ease-[var(--ease-out-quint)]",
              "data-[starting-style]:scale-95 data-[starting-style]:opacity-0",
              "data-[ending-style]:scale-95 data-[ending-style]:opacity-0",
              className
            )}
          >
            {content}
          </TooltipPrimitive.Popup>
        </TooltipPrimitive.Positioner>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}

export { Tooltip, TooltipProvider };
