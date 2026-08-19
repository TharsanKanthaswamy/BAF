"use client";

import * as React from "react";
import { toast } from "sonner";

import { sourceCounts } from "@/lib/analytics";
import { formatInteger } from "@/lib/format";
import { useConsoleSettings } from "@/lib/settings";
import type { TransactionRecord } from "@/lib/types";
import { cn } from "@/lib/utils";
import { EngineStatus } from "@/components/console/engine-status";
import { PageHeader, PageSections } from "@/components/console/page-header";
import { useConsoleData } from "@/components/console/use-console-data";
import { FilterBar } from "@/components/dashboard/filter-bar";
import { Panel, PanelBleed, PanelHeader } from "@/components/dashboard/panel";
import { SelectionBar } from "@/components/dashboard/selection-bar";
import { TransactionDetail } from "@/components/dashboard/transaction-detail";
import { TransactionTable } from "@/components/dashboard/transaction-table";

/**
 * The queue. One table, the full buffer behind it, and the filter that scopes the
 * rest of the console.
 *
 * The filter bar is sticky under the console bar because filtering is something an
 * analyst does while reading row four hundred, not only at the top of the page.
 */
export function TransactionsView() {
  const {
    rows,
    ordered,
    filtered,
    channels,
    filters,
    setFilters,
    analytics,
    now,
    awaiting,
    stale,
    deleteRows,
  } = useConsoleData();

  const { rowLimit } = useConsoleSettings();
  const [selected, setSelected] = React.useState<TransactionRecord | null>(null);
  const [ticked, setTicked] = React.useState<Set<string>>(() => new Set());

  const atCapacity = rows.length >= rowLimit;

  // The selection is intersected with the current result on read rather than
  // pruned in an effect. That makes one guarantee cheap to keep: a delete can
  // only ever touch rows the operator can currently see. Tick a hundred rows,
  // then narrow the filter, and the count drops to what is still on screen —
  // the hidden ticks are remembered, not armed.
  const condemned = React.useMemo(
    () => ordered.filter((row) => ticked.has(row.transaction_id)),
    [ordered, ticked]
  );
  const breakdown = React.useMemo(() => sourceCounts(condemned), [condemned]);

  const remove = async () => {
    const ids = condemned.map((row) => row.transaction_id);
    try {
      const result = await deleteRows(ids);
      setTicked(new Set());
      // The open drawer may have been describing one of the deleted rows.
      if (selected && ids.includes(selected.transaction_id)) setSelected(null);
      toast.success(
        `Deleted ${formatInteger(result.deleted)} transaction${result.deleted === 1 ? "" : "s"}`,
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

  return (
    <PageSections>
      <PageHeader
        title="Transactions"
        description="Every instruction the ensemble has scored, newest first. Open any row for the full triage breakdown: the signals that fired, both model residuals against their thresholds, and the narration. Tick rows to remove them from the buffer."
      />

      <EngineStatus />

      <FilterBar
        filters={filters}
        onChange={setFilters}
        channels={channels}
        counts={sourceCounts(rows)}
        shown={filtered.length}
        total={rows.length}
        className="sticky top-14 z-20"
      />

      <Panel className={cn((awaiting || stale) && "is-restating")}>
        <PanelHeader
          eyebrow="Scored buffer"
          title={`${formatInteger(ordered.length)} row${ordered.length === 1 ? "" : "s"} in view`}
          description={
            atCapacity
              ? `The buffer is holding its full ${formatInteger(rowLimit)}-row window, so anything older than the oldest row here has aged out. Raise the window in settings if you need more history.`
              : `${formatInteger(analytics.flagged)} flagged across ${formatInteger(analytics.accounts)} account${analytics.accounts === 1 ? "" : "s"}. Sort by any column; the sort applies to the whole result, not just the page on screen.`
          }
        />
        <PanelBleed>
          <TransactionTable
            rows={ordered}
            now={now}
            onInspect={setSelected}
            selectedId={selected?.transaction_id ?? null}
            selection={{ selected: ticked, onChange: setTicked }}
          />
        </PanelBleed>
      </Panel>

      <SelectionBar
        count={condemned.length}
        breakdown={breakdown}
        onClear={() => setTicked(new Set())}
        onDelete={remove}
      />

      <TransactionDetail transaction={selected} onClose={() => setSelected(null)} />
    </PageSections>
  );
}
