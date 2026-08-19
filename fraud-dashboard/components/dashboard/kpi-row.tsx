"use client";

import type { Analytics } from "@/lib/analytics";
import { StatTile } from "@/components/dashboard/stat-tile";

/**
 * Four figures, one instrument, in decision order: how much is at stake, how many
 * need a human, how much traffic there is, how hot the stream is running.
 *
 * They share a single bordered strip rather than sitting in four floating cards.
 * The hairlines are the grid gap showing the container through — one rule that
 * lands correctly at every breakpoint, including when the row folds to 2×2.
 *
 * Each delta compares the newer half of the visible window against the older
 * half. When there is no prior half to compare against, `analyse` returns `null`
 * and the figure omits the indicator rather than printing a fabricated 0%.
 */
export function KpiRow({ analytics }: { analytics: Analytics }) {
  const { buckets, delta } = analytics;
  const flaggedSpark = buckets.map((b) => b.flagged);
  const countSpark = buckets.map((b) => b.count);
  const exposureSpark = buckets.map((b) => b.exposure);

  return (
    <div className="overflow-hidden rounded-2xl bg-border ring-1 ring-border">
      <div className="grid gap-px sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          className="bg-card"
          label="Value at risk"
          value={analytics.exposure}
          format={{
            style: "currency",
            currency: "USD",
            maximumFractionDigits: 0,
            notation: analytics.exposure >= 1_000_000 ? "compact" : "standard",
          }}
          delta={delta.exposure}
          deltaIntent="inverse"
          spark={exposureSpark}
          caption={`Across ${analytics.flagged} flagged of ${analytics.total} scored`}
        />

        <StatTile
          className="bg-card"
          label="Needs review"
          value={analytics.critical}
          delta={delta.flagged}
          deltaIntent="inverse"
          spark={flaggedSpark}
          caption={
            analytics.critical === 0
              ? "No critical cases in this slice"
              : `${analytics.critical} critical · ${analytics.flagged - analytics.critical} lower-tier flags`
          }
        />

        <StatTile
          className="bg-card"
          label="Scored volume"
          value={analytics.total}
          delta={delta.volume}
          deltaIntent="neutral"
          spark={countSpark}
          caption={`${analytics.accounts} distinct account${analytics.accounts === 1 ? "" : "s"} on the wire`}
        />

        <StatTile
          className="bg-card"
          label="Flag rate"
          value={analytics.flagRate}
          format={{ style: "percent", maximumFractionDigits: 1 }}
          delta={delta.flagRate}
          deltaIntent="inverse"
          deltaUnit="points"
          caption={`Peak velocity ${analytics.peakVelocity} txn per bucket`}
        />
      </div>
    </div>
  );
}
