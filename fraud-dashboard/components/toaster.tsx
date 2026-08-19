"use client";

import { useTheme } from "@/components/theme-provider";
import { CircleCheck, Info, LoaderCircle, Siren, TriangleAlert } from "lucide-react";
import { Toaster as SonnerToaster, type ToasterProps } from "sonner";

/**
 * One Toaster, mounted once at the root — this replaces every `alert()` in the
 * app. Rendered `unstyled` so the toasts inherit the same hairline-ring + soft
 * elevation material as every other surface instead of Sonner's own shadow and
 * border, and so status colour comes from the reserved status tokens.
 *
 * Every status toast carries an icon beside its label: on the light surface
 * `warning` and `serious` sit below 3:1 contrast by design, so colour alone is
 * never allowed to carry the meaning.
 */
export function Toaster(props: ToasterProps) {
  const { resolvedTheme } = useTheme();

  return (
    <SonnerToaster
      theme={(resolvedTheme as ToasterProps["theme"]) ?? "system"}
      position="bottom-right"
      gap={10}
      offset={20}
      visibleToasts={4}
      icons={{
        success: <CircleCheck className="size-4 text-[var(--brand)]" />,
        error: <Siren className="size-4 text-[var(--severity-critical)]" />,
        warning: <TriangleAlert className="size-4 text-[var(--severity-medium)]" />,
        info: <Info className="size-4 text-[var(--chart-1)]" />,
        loading: (
          <LoaderCircle className="size-4 animate-spin text-muted-foreground" />
        ),
      }}
      toastOptions={{
        unstyled: true,
        classNames: {
          // `rounded-2xl` because a toast is a card that happens to float, not a
          // block nested inside one — the 10px radius it used to carry is the
          // inner-block step, and using it here put a tighter corner on the
          // outermost surface in the app than on the panels underneath it.
          toast:
            "flex w-full items-start gap-2.5 rounded-2xl bg-popover p-3.5 text-popover-foreground ring-1 ring-border shadow-[var(--shadow-overlay)]",
          icon: "mt-px flex size-4 shrink-0 items-center justify-center",
          content: "flex min-w-0 flex-1 flex-col gap-0.5",
          title: "text-body leading-snug font-medium",
          description: "text-callout leading-snug text-muted-foreground",
          actionButton:
            "pressable ml-auto shrink-0 self-center rounded-md bg-primary px-2 py-1 text-callout font-medium text-primary-foreground",
          cancelButton:
            "pressable shrink-0 self-center rounded-md bg-muted px-2 py-1 text-callout font-medium text-muted-foreground",
          closeButton:
            "grid size-5 place-items-center rounded-full bg-popover text-muted-foreground ring-1 ring-input",
        },
      }}
      {...props}
    />
  );
}
