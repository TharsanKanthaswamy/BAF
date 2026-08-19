import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * The one surface every block on the page sits on: a hairline ring and nothing
 * else.
 *
 * It used to carry a shadow. On a console this dense, a dozen elevated cards on
 * one screen is the loudest thing in the room and it is the single strongest tell
 * of a generated layout — every block shouting equally, none of them meaning it.
 * Elevation is now reserved for surfaces that genuinely float: menus, tooltips,
 * the nav sheet, the detail drawer. Everything structural separates with a line.
 *
 * `.card-hover` supplies the one piece of motion: the plane lightens a step and
 * rises a single pixel under a fine pointer. It is deliberately below the
 * threshold of a shadow — enough that the surface feels physical when the cursor
 * crosses it, not enough to imply the whole block is clickable.
 */
function Panel({ className, ...props }: React.ComponentProps<"section">) {
  return (
    <section
      data-slot="panel"
      className={cn(
        "surface-flat card-hover flex min-w-0 flex-col rounded-2xl bg-card text-card-foreground",
        className
      )}
      {...props}
    />
  );
}

function PanelHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
}: {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "flex flex-wrap items-start justify-between gap-x-4 gap-y-3 px-5 pt-4 pb-3",
        className
      )}
    >
      <div className="min-w-0 space-y-1">
        {eyebrow ? (
          <div className="text-eyebrow">{eyebrow}</div>
        ) : null}
        {/* Title 3 sits below the 20px optical crossover, so it stays on the
            Text cut — `font-sans` overrides the display face h2 inherits. */}
        <h2 className="font-sans text-title-3 font-semibold">
          {title}
        </h2>
        {description ? (
          <p className="max-w-prose text-callout leading-relaxed text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex shrink-0 items-center gap-1.5">{actions}</div>
      ) : null}
    </header>
  );
}

function PanelBody({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("min-w-0 flex-1 px-5 pb-5", className)} {...props} />;
}

/** Full-bleed body for tables, which supply their own horizontal padding. */
function PanelBleed({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("min-w-0 flex-1", className)} {...props} />;
}

function PanelFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border px-5 py-3 text-callout text-muted-foreground",
        className
      )}
      {...props}
    />
  );
}

export { Panel, PanelHeader, PanelBody, PanelBleed, PanelFooter };
