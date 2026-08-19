"use client";

import * as React from "react";
import { Checkbox as CheckboxPrimitive } from "@base-ui/react/checkbox";
import { Check, Minus } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * A checkbox, at table density.
 *
 * `indeterminate` is a real state here rather than a third boolean: a header
 * checkbox over a partial selection has to say "some" or it lies twice — once by
 * looking empty when rows are selected, and again by looking full when they are
 * not. Base UI drives `data-indeterminate` off the same prop the DOM uses, so
 * assistive tech reports `aria-checked="mixed"` without any extra wiring.
 *
 * 4px corners: the tightest step on the radius ladder, which is the rung for an
 * inline mark inside a table cell.
 */
function Checkbox({
  className,
  ...props
}: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        "peer grid size-4 shrink-0 place-items-center rounded-sm border border-input bg-transparent outline-none",
        "transition-[background-color,border-color,box-shadow,transform] duration-150 ease-[var(--ease-out-quint)]",
        "hover:border-[color-mix(in_oklab,var(--foreground)_35%,transparent)]",
        "focus-visible:ring-3 focus-visible:ring-ring/50",
        "active:scale-[0.92] motion-reduce:transition-none motion-reduce:active:scale-100",
        // Checked and indeterminate share one filled look. The accent is the
        // single accent — selection is an action state, not a severity.
        "data-[checked]:border-[var(--brand)] data-[checked]:bg-[var(--brand)] data-[checked]:text-[var(--brand-contrast)]",
        "data-[indeterminate]:border-[var(--brand)] data-[indeterminate]:bg-[var(--brand)] data-[indeterminate]:text-[var(--brand-contrast)]",
        "disabled:pointer-events-none disabled:opacity-40",
        className
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="grid place-items-center text-current data-[unchecked]:hidden"
        render={(indicatorProps, state) => (
          <span {...indicatorProps}>
            {state.indeterminate ? (
              <Minus aria-hidden className="size-3 stroke-3" />
            ) : (
              <Check aria-hidden className="size-3 stroke-3" />
            )}
          </span>
        )}
      />
    </CheckboxPrimitive.Root>
  );
}

export { Checkbox };
