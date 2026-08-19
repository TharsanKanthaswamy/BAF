"use client";

import type { RiskSlice } from "@/lib/analytics";
import { formatCompactCurrency, formatInteger, formatPercent } from "@/lib/format";
import { RISK_STYLES } from "@/lib/risk";
import type { RiskLevel } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Panel, PanelBody, PanelHeader } from "@/components/dashboard/panel";

/**
 * Composition, asked and answered once.
 *
 * "Where does the queue sit" is a part-to-whole question, so the graphic is one
 * segmented bar rather than four independent bars racing each other. Four bars
 * answer "how does each tier compare to the largest tier", which nobody asked.
 *
 * Segments are separated by a 2px surface gap so adjacent tiers never appear to
 * bleed into one another, and the outer ends carry the 4px data-end radius. The
 * exact figures sit in the rows underneath: on the light surface two of the four
 * severity steps fall under 3:1 against the card, so the direct labels and the
 * printed numbers are what make this legible. They are not decoration.
 */
export function RiskMix({
  slices,
  total,
  activeRisk,
  onSelectRisk,
  className,
}: {
  slices: RiskSlice[];
  total: number;
  activeRisk: RiskLevel | "ALL";
  onSelectRisk: (level: RiskLevel | "ALL") => void;
  className?: string;
}) {
  const present = slices.filter((slice) => slice.count > 0);
  const scoped = activeRisk !== "ALL";

  const composition = present
    .map((slice) => `${RISK_STYLES[slice.level].label} ${formatPercent(slice.share, 0)}`)
    .join(", ");

  return (
    <Panel className={className}>
      <PanelHeader
        eyebrow="Risk mix"
        title="Where the queue sits"
        description="Select a tier to scope the whole page to it."
      />

      <PanelBody className="space-y-3.5">
        {present.length === 0 ? (
          <div className="grid h-[4.5rem] place-items-center rounded-xl bg-inset text-center">
            <p className="px-6 text-callout text-muted-foreground">
              Nothing scored in this slice yet.
            </p>
          </div>
        ) : (
          <div
            role="img"
            aria-label={`Risk composition: ${composition}.`}
            className="flex h-2.5 gap-0.5"
          >
            {present.map((slice) => {
              const style = RISK_STYLES[slice.level];
              const dimmed = scoped && activeRisk !== slice.level;

              return (
                <div
                  key={slice.level}
                  // `flexGrow` rather than a percentage width: the 2px gaps are
                  // then absorbed by the layout instead of overflowing it.
                  style={{
                    flexGrow: slice.count,
                    flexBasis: 0,
                    background: style.colorVar,
                  }}
                  className={cn(
                    "min-w-[3px] first:rounded-l-sm last:rounded-r-sm",
                    "transition-[flex-grow,opacity] duration-[420ms] ease-[var(--ease-out-quint)] motion-reduce:transition-none",
                    dimmed && "opacity-30"
                  )}
                />
              );
            })}
          </div>
        )}

        <div>
          {/* Naming the three figures once, above the rows, keeps every row free
              of repeated units. */}
          <div className="flex items-center gap-2 px-2 pb-1 text-eyebrow">
            <span>Tier</span>
            <span className="ml-auto w-14 shrink-0 text-right">Count</span>
            <span className="w-11 shrink-0 text-right">Share</span>
            <span className="w-16 shrink-0 text-right">Value</span>
          </div>

          <div className="hairline-t">
            {slices.map((slice) => {
              const style = RISK_STYLES[slice.level];
              const selected = activeRisk === slice.level;
              const empty = slice.count === 0;

              return (
                <button
                  key={slice.level}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => onSelectRisk(selected ? "ALL" : slice.level)}
                  className={cn(
                    "hairline-b flex w-full items-center gap-2 px-2 py-1.5 text-left outline-none",
                    "transition-colors duration-150 ease-[var(--ease-out-quint)]",
                    "hover:bg-inset focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                    selected && "bg-muted",
                    empty && "text-muted-foreground"
                  )}
                >
                  {/* A 2px swatch tying the row to its segment above, with the
                      icon and the word beside it so colour is never the only
                      thing carrying the tier. */}
                  <span
                    aria-hidden
                    className="h-3.5 w-[3px] shrink-0 rounded-full"
                    style={{
                      background: empty ? "var(--swatch-off)" : style.colorVar,
                    }}
                  />
                  <style.Icon
                    aria-hidden
                    className={cn("size-3.5 shrink-0", empty ? "opacity-50" : style.fg)}
                  />
                  <span className="truncate text-body font-medium">{style.label}</span>

                  <span className="figures-tabular ml-auto w-14 shrink-0 text-right text-body font-semibold">
                    {formatInteger(slice.count)}
                  </span>
                  <span className="figures-tabular w-11 shrink-0 text-right text-callout text-muted-foreground">
                    {total > 0 ? formatPercent(slice.share, 0) : "0%"}
                  </span>
                  <span className="figures-tabular w-16 shrink-0 text-right text-callout text-muted-foreground">
                    {formatCompactCurrency(slice.exposure)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </PanelBody>
    </Panel>
  );
}
