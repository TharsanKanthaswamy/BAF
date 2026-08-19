"use client";

import * as React from "react";
import { RefreshCw } from "lucide-react";

import { fetchMetrics, type EngineMetrics } from "@/lib/api";
import { formatDecimal, formatInteger, formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";
import { EngineStatus } from "@/components/console/engine-status";
import { PageHeader, PageSections } from "@/components/console/page-header";
import { useConsoleData } from "@/components/console/use-console-data";
import { FilterBar } from "@/components/dashboard/filter-bar";
import { ModelDiagnostics } from "@/components/dashboard/model-diagnostics";
import { Panel, PanelBody, PanelHeader } from "@/components/dashboard/panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type MetricsState =
  | { status: "loading" }
  | { status: "ready"; data: EngineMetrics }
  | { status: "error"; message: string };

/**
 * The model floor.
 *
 * Two questions live here and they are not the same question. "How is the
 * ensemble behaving on the traffic in front of me" is measured from the filtered
 * slice and moves with the filter. "What has the engine actually loaded" comes
 * from `GET /metrics` and is fixed until someone redeploys. Mixing the two is how
 * a reviewer ends up quoting a training-time figure as if it described this
 * morning's traffic, so they are separate panels with separate provenance stated
 * on each.
 */
export function ModelsView() {
  const { filtered, rows, analytics, channels, filters, setFilters, awaiting, stale } =
    useConsoleData();

  const [metrics, setMetrics] = React.useState<MetricsState>({ status: "loading" });
  const [reloadKey, setReloadKey] = React.useState(0);

  React.useEffect(() => {
    const abort = new AbortController();
    let alive = true;

    async function run() {
      try {
        const data = await fetchMetrics(abort.signal);
        if (alive) setMetrics({ status: "ready", data });
      } catch (error) {
        if (!alive || abort.signal.aborted) return;
        setMetrics({
          status: "error",
          message:
            error instanceof Error
              ? error.message
              : "The engine did not answer the metrics request.",
        });
      }
    }

    void run();
    return () => {
      alive = false;
      abort.abort();
    };
  }, [reloadKey]);

  const served = metrics.status === "ready" ? metrics.data : null;

  return (
    <PageSections>
      <PageHeader
        title="Models"
        description="An autoencoder measures how badly a record fails to reconstruct, an isolation forest measures how few splits it takes to separate it, and a deterministic rule set checks the things that need no model at all."
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => setReloadKey((key) => key + 1)}
            disabled={metrics.status === "loading"}
          >
            <RefreshCw
              className={cn(
                "size-3.5",
                metrics.status === "loading" && "animate-spin"
              )}
            />
            Re-read metrics
          </Button>
        }
      />

      <EngineStatus />

      <FilterBar
        filters={filters}
        onChange={setFilters}
        channels={channels}
        shown={filtered.length}
        total={rows.length}
        className="sticky top-14 z-20"
      />

      <div className={cn("space-y-4", (awaiting || stale) && "is-restating")}>
        <ModelDiagnostics rows={filtered} analytics={analytics} metrics={served} />

        <Panel>
          <PanelHeader
            eyebrow="Deployment"
            title="Artefacts the engine has loaded"
            description="Read from the engine at page load, not from the traffic. These change only when the service is redeployed."
            actions={
              served ? (
                <Badge variant="outline" size="sm">
                  {served.engine_status}
                </Badge>
              ) : undefined
            }
          />
          <PanelBody>
            {metrics.status === "loading" ? (
              <ArtefactSkeleton />
            ) : metrics.status === "error" ? (
              <div className="space-y-3">
                <p className="text-body text-muted-foreground">
                  The engine did not return its metrics, so the figures in the panel
                  above are the fitted literals rather than the served ones.
                </p>
                <p className="text-callout text-[var(--severity-high)]">
                  {metrics.message}
                </p>
              </div>
            ) : (
              <ArtefactList metrics={metrics.data} />
            )}
          </PanelBody>
        </Panel>
      </div>
    </PageSections>
  );
}

/** Matches the shape of the list it stands in for, not a spinner. */
function ArtefactSkeleton() {
  return (
    <div className="space-y-px" aria-busy>
      <span className="sr-only">Reading the engine metrics.</span>
      {[0, 1, 2, 3].map((row) => (
        <div key={row} className="hairline-b flex items-center gap-3 py-2.5">
          <span className="h-3 w-32 rounded-full bg-muted" />
          <span className="ml-auto h-3 w-20 rounded-full bg-muted" />
        </div>
      ))}
    </div>
  );
}

function ArtefactList({ metrics }: { metrics: EngineMetrics }) {
  const budget = metrics.target_operational_budget;

  const entries: { label: string; value: string; note?: string }[] = [
    ...Object.entries(metrics.models).map(([name, value]) => ({
      label: name.replace(/[_-]+/g, " "),
      value,
    })),
    {
      label: "Contamination rate",
      value: formatPercent(metrics.contamination_rate_mean, 2),
      note: "outlier fraction the forest was fitted with",
    },
    {
      label: "Operational budget",
      // The engine reports this either as a fraction of traffic or as a review
      // headcount, so the unit is inferred rather than assumed.
      value: budget <= 1 ? formatPercent(budget, 2) : formatInteger(budget),
      note:
        budget <= 1
          ? "share of traffic the review desk can absorb"
          : "reviews per window the desk can absorb",
    },
  ];

  return (
    <dl className="space-y-0">
      {entries.map((entry) => (
        <div
          key={entry.label}
          className="hairline-b flex flex-wrap items-baseline gap-x-4 gap-y-1 py-2.5 last:border-b-0"
        >
          <dt className="min-w-0 text-body">
            <span className="font-medium capitalize">{entry.label}</span>
            {entry.note ? (
              <span className="block text-subheadline text-muted-foreground">
                {entry.note}
              </span>
            ) : null}
          </dt>
          <dd className="figures-tabular ml-auto text-body font-medium">
            {entry.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
