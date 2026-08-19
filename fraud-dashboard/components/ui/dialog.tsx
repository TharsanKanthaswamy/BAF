"use client";

import * as React from "react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";

const Dialog = DialogPrimitive.Root;
const DialogTrigger = DialogPrimitive.Trigger;
const DialogClose = DialogPrimitive.Close;

function DialogBackdrop({
  className,
  ...props
}: DialogPrimitive.Backdrop.Props) {
  return (
    <DialogPrimitive.Backdrop
      className={cn(
        "fixed inset-0 z-50 bg-scrim",
        "transition-opacity duration-[260ms] ease-[var(--ease-out-quint)]",
        "data-[starting-style]:opacity-0 data-[ending-style]:opacity-0",
        // The page recedes as well as dims. iOS pushes the layer behind a sheet
        // out of focus so the sheet is unambiguously the thing in front.
        "supports-[backdrop-filter:blur(1px)]:backdrop-blur-[6px]",
        className
      )}
      {...props}
    />
  );
}

/**
 * Two presentations, one component.
 *
 * On a phone this is an iOS sheet: anchored to the bottom edge, corners on the
 * top only, a grabber to say it is dismissible, sliding up on the drawer curve.
 * That puts the content in thumb reach instead of stranding it mid-screen.
 *
 * From `sm` up it is a centred pane. It scales from its own centre — not from the
 * row that opened it — because it is a new context rather than an extension of
 * that row. Entry starts at 0.97, never 0: something growing out of nothing has
 * no physical analogue and reads as a cartoon.
 */
function DialogPopup({
  className,
  children,
  showClose = true,
  ...props
}: DialogPrimitive.Popup.Props & { showClose?: boolean }) {
  return (
    <DialogPrimitive.Portal>
      <DialogBackdrop />
      <DialogPrimitive.Popup
        className={cn(
          "material-floating fixed z-50 grid overflow-hidden text-card-foreground outline-none",
          // Header and footer at their natural height, body absorbing whatever is
          // left. Without this the grid falls back to three implicit `auto` rows,
          // each sized from its own content, so a long body pushes the total past
          // `max-h` and `overflow-hidden` clips the surplus — off the top, since
          // the pane is centred. `minmax(0,1fr)` rather than `1fr` because a `1fr`
          // track floors at min-content, which is what stops `DialogBody` from
          // ever scrolling: it needs to be allowed to shrink below its content.
          "grid-rows-[auto_minmax(0,1fr)_auto]",
          // Belt and braces: if a header or footer is ever tall enough to overflow
          // on its own, the surplus goes out the bottom rather than the top, where
          // it would take the title and the close button with it.
          "content-start",
          // Phone: bottom sheet. `rounded-t-4xl` is the 28px sheet step, which
          // exists in the scale for exactly this surface — it was spelled
          // `rounded-t-[1.75rem]` here, the same number written the long way.
          "inset-x-0 bottom-0 max-h-[88dvh] rounded-t-4xl pt-2.5",
          "transition-[opacity,translate,scale] duration-[380ms] ease-[var(--ease-drawer)]",
          "data-[starting-style]:translate-y-full data-[ending-style]:translate-y-full",
          // Tablet up: centred pane.
          "sm:inset-x-auto sm:top-1/2 sm:bottom-auto sm:left-1/2 sm:w-full sm:pt-0",
          "sm:max-h-[min(46rem,calc(100dvh-4rem))] sm:max-w-[min(46rem,calc(100vw-3rem))]",
          "sm:origin-center sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-3xl",
          "sm:duration-[260ms] sm:ease-[var(--ease-out-quint)]",
          "sm:data-[starting-style]:translate-y-[-50%] sm:data-[starting-style]:scale-[0.97]",
          "sm:data-[ending-style]:translate-y-[-50%] sm:data-[ending-style]:scale-[0.97]",
          "data-[starting-style]:opacity-0 data-[ending-style]:opacity-0",
          className
        )}
        {...props}
      >
        {/* The grabber. It reads as "you can dismiss this" whether or not the
            gesture is wired up, which is why iOS shows it on every sheet. */}
        <span
          aria-hidden
          className="absolute top-2 left-1/2 z-20 h-[0.3125rem] w-9 -translate-x-1/2 rounded-full bg-foreground/20 sm:hidden"
        />
        {children}
        {showClose ? (
          <DialogPrimitive.Close
            aria-label="Close"
            className={cn(
              "pressable absolute top-4 right-3.5 z-10 grid size-8 place-items-center rounded-full sm:top-3.5",
              "bg-inset text-muted-foreground",
              "hover:bg-inset-hover hover:text-foreground"
            )}
          >
            <X className="size-4" />
          </DialogPrimitive.Close>
        ) : null}
      </DialogPrimitive.Popup>
    </DialogPrimitive.Portal>
  );
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn(
        "flex flex-col gap-1.5 border-b border-border px-6 py-5 pr-14",
        className
      )}
      {...props}
    />
  );
}

function DialogBody({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-body"
      className={cn("scroll-thin min-h-0 overflow-y-auto px-6 py-5", className)}
      {...props}
    />
  );
}

function DialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "flex flex-wrap items-center justify-end gap-2 border-t border-border bg-inset px-6 py-4",
        className
      )}
      {...props}
    />
  );
}

function DialogTitle({ className, ...props }: DialogPrimitive.Title.Props) {
  return (
    <DialogPrimitive.Title
      // Renders an <h2>, which the base layer puts on the display face. At 17px
      // it belongs on the Text cut instead; a caller that scales it up past the
      // crossover opts back in with `font-heading`.
      className={cn("font-sans text-title-2 font-semibold", className)}
      {...props}
    />
  );
}

function DialogDescription({
  className,
  ...props
}: DialogPrimitive.Description.Props) {
  return (
    <DialogPrimitive.Description
      className={cn("text-body text-muted-foreground", className)}
      {...props}
    />
  );
}

export {
  Dialog,
  DialogTrigger,
  DialogClose,
  DialogPopup,
  DialogBackdrop,
  DialogHeader,
  DialogBody,
  DialogFooter,
  DialogTitle,
  DialogDescription,
};
