import { CircleAlert, Info } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * A one-line banner for a condition the operator has to know about before they
 * trust the figures below it: the engine is unreachable, the buffer is empty, a
 * filter is hiding everything.
 *
 * Deliberately a rule-and-wash strip rather than a card. At this density an
 * elevated box around a sentence outweighs the data it is warning about.
 */
export function StatusStrip({
  tone,
  title,
  detail,
  action,
  className,
}: {
  tone: "neutral" | "critical";
  title: string;
  detail?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      role="status"
      className={cn(
        "flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl px-3.5 py-2.5",
        // The ring lives on the neutral branch rather than on the shared line
        // above: `.notice` draws its edge with `box-shadow: inset`, which is
        // what `ring-1 ring-inset` compiles to, and utilities sit in a later
        // layer than components — so an unconditional ring here would silently
        // win over the tinted edge and paint it `--border` grey.
        tone === "critical"
          ? "notice [--notice:var(--severity-critical)]"
          : "bg-card ring-1 ring-border ring-inset",
        className
      )}
    >
      {/* Icon plus words, never a bare coloured dot: state is never carried by
          colour alone. */}
      {tone === "critical" ? (
        <CircleAlert
          aria-hidden
          className="size-4 shrink-0 text-[var(--severity-critical)]"
        />
      ) : (
        <Info aria-hidden className="size-4 shrink-0 text-muted-foreground" />
      )}
      <p className="text-body font-medium">{title}</p>
      {detail ? (
        <p className="min-w-0 text-callout text-muted-foreground">{detail}</p>
      ) : null}
      {action ? <div className="ml-auto shrink-0">{action}</div> : null}
    </div>
  );
}
