"use client";

import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";

import { cn } from "@/lib/utils";

const Sheet = DialogPrimitive.Root;
const SheetTrigger = DialogPrimitive.Trigger;
const SheetClose = DialogPrimitive.Close;

/**
 * An edge-anchored panel: the mobile presentation of the console's navigation.
 *
 * Distinct from `Dialog` because the two behave differently. A dialog is a new
 * context that arrives in the middle of the screen; a sheet slides in from the
 * edge it belongs to and stays attached to it, which is what tells you the nav
 * is still the nav rather than a modal about navigation.
 *
 * This is the one surface besides the console bar that keeps the glass material,
 * because it is also the one where page content genuinely moves behind a
 * translucent pane.
 */
function SheetPopup({
  className,
  children,
  ...props
}: DialogPrimitive.Popup.Props) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Backdrop
        className={cn(
          "fixed inset-0 z-50 bg-scrim",
          "transition-opacity duration-[260ms] ease-[var(--ease-out-quint)]",
          "data-[starting-style]:opacity-0 data-[ending-style]:opacity-0",
          "supports-[backdrop-filter:blur(1px)]:backdrop-blur-[6px]"
        )}
      />
      <DialogPrimitive.Popup
        className={cn(
          "material-floating fixed inset-y-0 left-0 z-50 flex w-[17rem] max-w-[85vw] flex-col",
          "rounded-r-3xl rounded-l-none text-card-foreground outline-none",
          "transition-[opacity,translate] duration-[340ms] ease-[var(--ease-drawer)]",
          "data-[starting-style]:-translate-x-full data-[ending-style]:-translate-x-full",
          "data-[starting-style]:opacity-0 data-[ending-style]:opacity-0",
          className
        )}
        {...props}
      >
        {children}
      </DialogPrimitive.Popup>
    </DialogPrimitive.Portal>
  );
}

const SheetTitle = DialogPrimitive.Title;
const SheetDescription = DialogPrimitive.Description;

export { Sheet, SheetTrigger, SheetClose, SheetPopup, SheetTitle, SheetDescription };
