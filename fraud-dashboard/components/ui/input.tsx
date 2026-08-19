import * as React from "react";

import { cn } from "@/lib/utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "flex h-9 w-full min-w-0 rounded-lg bg-card px-3 py-1 text-body",
        "ring-1 ring-inset ring-input outline-none",
        "placeholder:text-muted-foreground/70",
        "selection:bg-primary selection:text-primary-foreground",
        "file:h-7 file:border-0 file:bg-transparent file:text-body file:font-medium",
        // `type="search"` draws a browser-supplied cancel button in WebKit and
        // Chromium, which lands on top of any clear button the app renders and
        // reads as two X's in one field. The native one cannot be styled, so the
        // app's own is the one that stays.
        "[&::-webkit-search-cancel-button]:appearance-none [&::-webkit-search-decoration]:appearance-none",
        "[&::-webkit-search-results-button]:appearance-none",
        "transition-[box-shadow,background-color] duration-150 ease-[var(--ease-out-quint)]",
        "hover:ring-input-hover",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        "disabled:pointer-events-none disabled:opacity-50",
        "aria-invalid:ring-destructive/50",
        // A control sits one step off the surface behind it. In light mode
        // `bg-card` (#fff) already does that against the #f6f6f6 page; in dark
        // mode a card is itself #181818, so a field inside one needs the nested
        // step or it disappears into its container. This used to be
        // `dark:bg-input/30` — an opacity applied to an already-translucent
        // token, which resolved to #1f1f1f by accident rather than by choice.
        "dark:bg-inset",
        className
      )}
      {...props}
    />
  );
}

function Label({ className, ...props }: React.ComponentProps<"label">) {
  return (
    <label
      data-slot="label"
      className={cn(
        "text-body leading-none font-medium text-foreground select-none",
        className
      )}
      {...props}
    />
  );
}

/** A labelled control with optional helper text — one consistent field rhythm. */
function Field({
  label,
  hint,
  htmlFor,
  className,
  children,
}: {
  label: string;
  hint?: React.ReactNode;
  htmlFor?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint ? (
        <p className="text-callout leading-snug text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

export { Input, Label, Field };
