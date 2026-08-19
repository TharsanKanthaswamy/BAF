import { cn } from "@/lib/utils";

/**
 * The heading block every page opens with.
 *
 * The console bar above already names the section, so this is the place for the
 * sentence that tells an analyst what the page is for and what they are allowed
 * to conclude from it. Actions specific to the page sit on the right; global
 * actions live in the bar.
 */
export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-end justify-between gap-x-6 gap-y-3 pb-1",
        className
      )}
    >
      <div className="min-w-0 space-y-1.5">
        {/* Above the 20px optical crossover, so the display cut inherited from
            the base layer is the right one. */}
        <h1 className="text-large-title sm:text-page-title">{title}</h1>
        {description ? (
          <p className="max-w-[68ch] text-body leading-relaxed text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
      ) : null}
    </div>
  );
}

/**
 * Vertical rhythm for a page's stack of sections. One value, used everywhere.
 *
 * It also owns the arrival: `.stagger-children` rises each section in turn, so
 * every page animates in without a single view having to opt in or track an
 * index. The cascade replays per navigation because `AppShell` keys the wrapper
 * above this on the pathname.
 */
export function PageSections({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div className={cn("stagger-children space-y-4", className)} {...props} />
  );
}
