"use client";

import * as React from "react";

import { applyFilters, sortNewestFirst, sourceCounts } from "@/lib/analytics";
import { formatCompactCurrency, formatInteger } from "@/lib/format";
import { normalizeRisk, RISK_SEVERITY_DESC, RISK_STYLES } from "@/lib/risk";
import type { RiskLevel, TransactionRecord } from "@/lib/types";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { EngineStatus } from "@/components/console/engine-status";
import { PageHeader, PageSections } from "@/components/console/page-header";
import { useConsoleData } from "@/components/console/use-console-data";
import { FilterBar } from "@/components/dashboard/filter-bar";
import { Panel, PanelBleed, PanelHeader } from "@/components/dashboard/panel";
import { SelectionBar } from "@/components/dashboard/selection-bar";
import { TransactionDetail } from "@/components/dashboard/transaction-detail";
import { TransactionTable } from "@/components/dashboard/transaction-table";

/**
 * The work queue.
 *
 * `/transactions` answers "what has the engine seen"; this page answers "what do I
 * have to decide". Those are different jobs, which is why the ordering differs:
 * here the worst tier comes first and recency only breaks ties within a tier,
 * because a critical case from an hour ago outranks a medium case from a minute
 * ago no matter what the clock says.
 */
export function AlertsView() {
  const { rows, channels, filters, setFilters, now, awaiting, stale, deleteRows } =
    useConsoleData();

  const [selected, setSelected] = React.useState<TransactionRecord | null>(null);
  const [ticked, setTicked] = React.useState<Set<string>>(() => new Set());

  const alerts = React.useMemo(() => {
    // The verdict is not the analyst's to choose here — this page is the flagged
    // set by definition. Everything else in the shared filter still applies.
    return sortNewestFirst(applyFilters(rows, { ...filters, verdict: "FLAGGED" }));
  }, [rows, filters]);

  const condemned = React.useMemo(
    () => alerts.filter((row) => ticked.has(row.transaction_id)),
    [alerts, ticked]
  );
  const breakdown = React.useMemo(() => sourceCounts(condemned), [condemned]);

  const remove = async () => {
    const ids = condemned.map((row) => row.transaction_id);
    try {
      const result = await deleteRows(ids);
      setTicked(new Set());
      if (selected && ids.includes(selected.transaction_id)) setSelected(null);
      toast.success(
        `Resolved & deleted ${formatInteger(result.deleted)} alert${result.deleted === 1 ? "" : "s"}`,
        {
          description: `${formatInteger(result.remaining)} row${result.remaining === 1 ? "" : "s"} left in the buffer.`,
        }
      );
    } catch (error) {
      toast.error("Delete failed", {
        description:
          error instanceof Error
            ? error.message
            : "The engine did not confirm the deletion. Nothing was removed.",
      });
    }
  };

  const byTier = React.useMemo(() => {
    const counts = new Map<RiskLevel, { count: number; exposure: number }>();
    for (const row of alerts) {
      const level = normalizeRisk(row.risk_level);
      const entry = counts.get(level) ?? { count: 0, exposure: 0 };
      entry.count += 1;
      entry.exposure += row.amount;
      counts.set(level, entry);
    }
    return counts;
  }, [alerts]);

  const exposure = React.useMemo(
    () => alerts.reduce((sum, row) => sum + row.amount, 0),
    [alerts]
  );

  return (
    <PageSections>
      <PageHeader
        title="Alerts"
        description="Instructions the ensemble would not clear. Ordered by tier, then by recency, so the top of this list is always the next thing to look at."
      />

      <EngineStatus />

      <FilterBar
        filters={filters}
        onChange={setFilters}
        channels={channels}
        shown={alerts.length}
        total={rows.length}
        className="sticky top-14 z-20"
      />

      <div className={cn("space-y-4", (awaiting || stale) && "is-restating")}>
        <div className="overflow-hidden rounded-2xl bg-border ring-1 ring-border">
          <div className="grid gap-px sm:grid-cols-2 xl:grid-cols-4">
            {RISK_SEVERITY_DESC.map((level) => {
              const style = RISK_STYLES[level];
              const entry = byTier.get(level);
              const count = entry?.count ?? 0;

              return (
                <div
                  key={level}
                  className={cn(
                    "flex min-w-0 items-center gap-2.5 bg-card px-4 py-3.5",
                    "transition-colors duration-200 ease-[var(--ease-out-quint)]",
                    "hover:bg-card-hover"
                  )}
                >
                  <span
                    aria-hidden
                    className="h-7 w-[3px] shrink-0 rounded-full"
                    style={{
                      background: count === 0 ? "var(--swatch-off)" : style.colorVar,
                    }}
                  />
                  <div className="min-w-0">
                    <p className="flex items-baseline gap-1.5 font-semibold leading-none">
                      <span className="figures-tabular text-title-2">{formatInteger(count)}</span>
                      <span className="text-subheadline text-muted-foreground">{style.label}</span>
                    </p>
                    <p className="figures-tabular mt-1 truncate text-callout text-muted-foreground">
                      {entry?.exposure ? formatCompactCurrency(entry.exposure) : "—"}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <Panel>
          <PanelHeader
            eyebrow="Open cases"
            title={
              alerts.length === 0
                ? "Nothing awaiting a decision"
                : `${formatInteger(alerts.length)} case${alerts.length === 1 ? "" : "s"} · ${formatCompactCurrency(exposure)} at stake`
            }
            description="This page is the flagged set by definition, so the verdict filter above does not apply to it. Search, tier and channel all do."
          />
          <PanelBleed>
            <TransactionTable
              rows={alerts}
              now={now}
              onInspect={setSelected}
              selectedId={selected?.transaction_id ?? null}
              selection={{ selected: ticked, onChange: setTicked }}
              initialSort={{ key: "risk", dir: "desc" }}
            />
          </PanelBleed>
        </Panel>
      </div>

      <SelectionBar
        count={condemned.length}
        breakdown={breakdown}
        onClear={() => setTicked(new Set())}
        onDelete={remove}
      />

      <TransactionDetail
        transaction={selected}
        onClose={() => setSelected(null)}
        onDelete={async (id) => {
          await deleteRows([id]);
          setSelected(null);
        }}
      />
    </PageSections>
  );
}
