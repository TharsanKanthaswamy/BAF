"use client";

import { Select as SelectPrimitive } from "@base-ui/react/select";
import { Check, ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";

const Select = SelectPrimitive.Root;
const SelectValue = SelectPrimitive.Value;

function SelectTrigger({
  className,
  children,
  ...props
}: SelectPrimitive.Trigger.Props) {
  return (
    <SelectPrimitive.Trigger
      data-slot="select-trigger"
      className={cn(
        "pressable flex h-9 w-full items-center justify-between gap-2 rounded-lg bg-card px-3 text-body",
        "ring-1 ring-inset ring-input outline-none select-none",
        "hover:ring-input-hover",
        "focus-visible:ring-2 focus-visible:ring-ring",
        "data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        // Same nested-step reasoning as `Input` — see the comment there.
        "dark:bg-inset",
        className
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon className="text-muted-foreground transition-transform duration-200 ease-[var(--ease-out-quint)] data-[popup-open]:rotate-180">
        <ChevronDown className="size-4" />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  );
}

/**
 * A popup scales from the edge nearest its trigger — Base UI hands us that
 * point as `--transform-origin`, so the panel reads as growing *out of* the
 * control rather than appearing beside it.
 */
function SelectContent({
  className,
  children,
  ...props
}: SelectPrimitive.Popup.Props) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Positioner
        sideOffset={6}
        alignItemWithTrigger={false}
        className="z-50 outline-none"
      >
        <SelectPrimitive.Popup
          className={cn(
            "scroll-thin max-h-[min(20rem,var(--available-height))] min-w-[max(9rem,var(--anchor-width))]",
            // A menu floats over live content, so glass is real here rather than
            // decorative. iOS menu radius, not the web default.
            "material-floating overflow-y-auto rounded-2xl p-1 text-popover-foreground outline-none",
            "origin-[var(--transform-origin)] transition-[opacity,transform,scale] duration-200 ease-[var(--ease-out-quint)]",
            "data-[starting-style]:scale-[0.96] data-[starting-style]:opacity-0",
            "data-[ending-style]:scale-[0.96] data-[ending-style]:opacity-0",
            className
          )}
          {...props}
        >
          <SelectPrimitive.List>{children}</SelectPrimitive.List>
        </SelectPrimitive.Popup>
      </SelectPrimitive.Positioner>
    </SelectPrimitive.Portal>
  );
}

function SelectItem({
  className,
  children,
  ...props
}: SelectPrimitive.Item.Props) {
  return (
    <SelectPrimitive.Item
      className={cn(
        "relative flex cursor-default items-center gap-2 rounded-md py-1.5 pr-2 pl-7 text-body outline-none select-none",
        "transition-colors duration-100 ease-[var(--ease-out-quint)]",
        "data-[highlighted]:bg-muted data-[highlighted]:text-foreground",
        "data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        className
      )}
      {...props}
    >
      <SelectPrimitive.ItemIndicator className="absolute left-1.5 flex size-4 items-center justify-center">
        <Check className="size-3.5" strokeWidth={2.5} />
      </SelectPrimitive.ItemIndicator>
      <SelectPrimitive.ItemText className="flex flex-1 items-center gap-2">
        {children}
      </SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  );
}

export { Select, SelectTrigger, SelectValue, SelectContent, SelectItem };
