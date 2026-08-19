import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  // Never `transition-all`: it animates properties you did not choose (layout,
  // filter, even `height` on a wrapper) and is the usual source of a laggy
  // press. Name the properties, keep the duration under 200ms.
  "group/button inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent bg-clip-padding text-body font-medium whitespace-nowrap outline-none select-none transition-[background-color,border-color,color,box-shadow,transform,opacity] duration-150 ease-[var(--ease-out-quint)] focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:not-aria-[haspopup]:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 motion-reduce:transition-none motion-reduce:active:scale-100",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/85",
        // The accent, and the only place it appears on a control. Reserved for
        // the one action a page exists to perform — scoring a payload, running a
        // burst, uploading a ledger. If two of these are visible at once, one of
        // them is not the primary action.
        brand:
          "bg-[var(--brand)] text-[var(--brand-contrast)] hover:bg-[color-mix(in_oklab,var(--brand),white_12%)] focus-visible:ring-[color-mix(in_oklab,var(--brand)_45%,transparent)]",
        outline:
          "border-border bg-transparent hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:border-input dark:hover:bg-muted",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_5%)] aria-expanded:bg-secondary aria-expanded:text-secondary-foreground",
        ghost:
          "hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:hover:bg-inset",
        destructive:
          "bg-destructive/10 text-destructive hover:bg-destructive/20 focus-visible:border-destructive/40 focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:hover:bg-destructive/30 dark:focus-visible:ring-destructive/40",
        // Solid danger, for the button that actually performs the irreversible
        // thing. The tinted `destructive` above is for the control that opens the
        // confirmation; if both looked the same, the confirmation would read as a
        // repeat of the click that got you there.
        danger:
          "bg-destructive text-[var(--destructive-contrast)] hover:bg-[color-mix(in_oklab,var(--destructive),black_10%)] focus-visible:ring-destructive/40 dark:hover:bg-[color-mix(in_oklab,var(--destructive),white_12%)]",
        link: "text-primary underline-offset-4 hover:underline",
      },
      // Every size shares the base `rounded-lg` — 8px is the control radius, and
      // a control does not change shape because it got shorter. The old
      // `min(var(--radius-md), 12px)` clamps existed to tame a radius scale that
      // was derived by multiplication; the scale is now explicit, so they go.
      size: {
        default:
          "h-8 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        xs: "h-6 gap-1 px-2 text-callout has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-7 gap-1 px-2.5 text-callout has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-9 gap-1.5 px-3 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        icon: "size-8",
        "icon-xs": "size-6 [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-7",
        "icon-lg": "size-9",
        // The one exception, and it is a different shape on purpose: a pill is
        // its own affordance, not a button that lost its corners.
        pill: "h-8 gap-1.5 rounded-full px-3.5 has-data-[icon=inline-start]:pl-2.5",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
