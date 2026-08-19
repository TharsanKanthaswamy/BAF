"use client";

import * as React from "react";
import { ArrowDown, ArrowUp, ChevronRight } from "lucide-react";

import {
  formatCurrency,
  formatDecimal,
  formatInteger,
  formatRelative,
  formatScore,
  formatTimestamp,
  truncateId,
} from "@/lib/format";
import { field, normalizeRisk, RISK_STYLES, riskRank } from "@/lib/risk";
import { rowSource } from "@/lib/analytics";
import { useConsoleSettings } from "@/lib/settings";
import { SOURCE_LABEL, type TransactionRecord } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Pager } from "@/components/dashboard/pager";
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip } from "@/components/ui/tooltip";

type SortKey = "time" | "risk" | "amount" | "mse" | "isolation" | "velocity";

export interface SortState {
  key: SortKey;
  dir: "asc" | "desc";
}

/**
 * Selection, owned by the caller.
 *
 * The table does not hold this state: a delete action lives outside the table,
 * and the set has to outlive a re-sort, a page turn, and a filter change to be
 * worth anything. The caller passes the set down and decides what a selection
 * means.
 */
export interface TableSelection {
  selected: ReadonlySet<string>;
  onChange: (next: Set<string>) => void;
}

const COLUMNS: {
  key: SortKey | null;
  label: string;
  align?: "right";
  hint?: string;
  hideBelow?: string;
}[] = [
  { key: "risk", label: "Risk" },
  { key: "time", label: "Transaction" },
  { key: null, label: "Account", hideBelow: "md:table-cell" },
  { key: "amount", label: "Amount", align: "right" },
  {
    key: null,
    label: "Balance drain",
    hint: "Share of the account's available balance moved by this one instruction.",
    hideBelow: "lg:table-cell",
  },
  {
    key: "velocity",
    label: "Vel. 12h",
    align: "right",
    hint: "Transactions from this account in the preceding 12 hours.",
    hideBelow: "lg:table-cell",
  },
  {
    key: "mse",
    label: "AE MSE",
    align: "right",
    hint: "Autoencoder reconstruction error. Above 0.05 the record sits outside the learnt manifold.",
  },
  {
    key: "isolation",
    label: "Iso. score",
    align: "right",
    hint: "Isolation Forest score. Negative means the record separates from the bulk in few splits.",
    hideBelow: "xl:table-cell",
  },
  { key: null, label: "Channel", hideBelow: "xl:table-cell" },
  {
    key: null,
    label: "Origin",
    hint: "How the record entered the buffer. Seeded and simulated rows are generated; uploaded and hand-scored rows are yours.",
    hideBelow: "2xl:table-cell",
  },
];

function sortValue(row: TransactionRecord, key: SortKey): number {
  switch (key) {
    case "risk":
      return -riskRank(row.risk_level);
    case "amount":
      return row.amount;
    case "mse":
      return row.autoencoder_mse;
    case "isolation":
      return -row.isolation_score;
    case "velocity":
      return field.velocity(row);
    case "time": {
      const at = field.at(row);
      const t = at ? new Date(at).getTime() : 0;
      return Number.isNaN(t) ? 0 : t;
    }
  }
}

/**
 * The dense view. Figures are tabular here — they sit in columns and must align
 * digit-for-digit — and every risk cell pairs its colour with an icon and a
 * word, so the two severity steps that fall below 3:1 on the light surface are
 * never the only thing distinguishing a row.
 *
 * The buffer holds up to ten thousand records, so the page is the unit of work:
 * sorting runs over everything, rendering runs over one page. Ten thousand rows
 * of nine cells each is roughly ninety thousand DOM nodes, which no amount of
 * scroll containment makes usable.
 */
export function TransactionTable({
  rows,
  now,
  onInspect,
  selectedId,
  initialSort,
  selection,
  className,
}: {
  rows: TransactionRecord[];
  now: number | null;
  onInspect: (row: TransactionRecord) => void;
  selectedId?: string | null;
  /**
   * The order the table opens in. The queue wants recency; the alert list wants
   * severity. Both are still re-sortable by the analyst from the headers.
   */
  initialSort?: SortState;
  /** Omit to render the table without a selection column at all. */
  selection?: TableSelection;
  className?: string;
}) {
  const { pageSize, density } = useConsoleSettings();
  const [sort, setSort] = React.useState<SortState>(
    initialSort ?? { key: "time", dir: "desc" }
  );
  const [page, setPage] = React.useState(0);

  const sorted = React.useMemo(() => {
    const factor = sort.dir === "asc" ? 1 : -1;
    return [...rows].sort(
      (a, b) => (sortValue(a, sort.key) - sortValue(b, sort.key)) * factor
    );
  }, [rows, sort]);

  // The page index is clamped on read rather than corrected in an effect. A
  // tighter filter or a smaller page size can strand the index past the end, and
  // deriving the safe value keeps that a render-time concern with no extra pass.
  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const start = safePage * pageSize;
  const visible = React.useMemo(
    () => sorted.slice(start, start + pageSize),
    [sorted, start, pageSize]
  );

  // How much of *this* result set is selected. Counted against `rows` rather
  // than the visible page, because "select all" has to mean every row the
  // current filter admits — an operator clearing 4,000 simulated records should
  // not have to turn 80 pages — and counted against `rows` rather than the raw
  // set, because a selection made under a looser filter must not silently
  // survive into a delete the operator can no longer see.
  const selectedHere = React.useMemo(() => {
    if (!selection) return [];
    return rows
      .map((row) => row.transaction_id)
      .filter((id) => selection.selected.has(id));
  }, [rows, selection]);

  const allSelected = selection !== undefined && selectedHere.length === rows.length && rows.length > 0;
  const someSelected = selectedHere.length > 0 && !allSelected;

  const toggleAll = () => {
    if (!selection) return;
    const next = new Set(selection.selected);
    if (allSelected) {
      for (const row of rows) next.delete(row.transaction_id);
    } else {
      for (const row of rows) next.add(row.transaction_id);
    }
    selection.onChange(next);
  };

  const toggleRow = (id: string) => {
    if (!selection) return;
    const next = new Set(selection.selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    selection.onChange(next);
  };

  const toggle = (key: SortKey) => {
    setSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === "desc" ? "asc" : "desc" }
        : { key, dir: "desc" }
    );
    // A re-sort makes the old page index meaningless, so re-sorting returns you
    // to the top of the new order.
    setPage(0);
  };

  if (rows.length === 0) {
    return (
      <div className="grid min-h-[12rem] place-items-center px-5 pb-5 text-center">
        <p className="max-w-sm text-body text-muted-foreground">
          Nothing matches the current filters. Reset them, or inject a synthetic
          burst from the simulator to put traffic on the wire.
        </p>
      </div>
    );
  }

  const cellY = density === "compact" ? "py-1" : "py-2";

  return (
    <div className={cn("flex min-w-0 flex-col", className)}>
      <div className="scroll-thin figures-tabular max-h-[42rem] overflow-auto">
        <table className="w-full border-collapse text-left text-body">
          <caption className="sr-only">
            Scored transactions, page {safePage + 1} of {pageCount}. Each row opens
            a full triage breakdown.
          </caption>
          {/* The header rides the card surface, not the page chrome, so it stays
              opaque over rows scrolling beneath it. */}
          <thead className="material-head sticky top-0 z-10">
            <tr>
              {/* The status rule column: 2px of colour, no header text. */}
              <th scope="col" className="w-0.5 p-0" />

              {selection ? (
                <th
                  scope="col"
                  className="hairline-b w-9 pr-1 pl-3 align-middle"
                >
                  <Checkbox
                    checked={allSelected}
                    indeterminate={someSelected}
                    onCheckedChange={toggleAll}
                    aria-label={
                      allSelected
                        ? `Clear the selection of all ${rows.length} rows`
                        : `Select all ${rows.length} rows matching the current filters`
                    }
                  />
                </th>
              ) : null}

              {COLUMNS.map((col) => {
                const active = col.key !== null && sort.key === col.key;
                const Arrow = sort.dir === "asc" ? ArrowUp : ArrowDown;
                const header = (
                  <span
                    className={cn(
                      "inline-flex items-center gap-1",
                      col.align === "right" && "flex-row-reverse"
                    )}
                  >
                    {col.label}
                    {active ? (
                      <Arrow aria-hidden className="size-3 text-foreground" />
                    ) : null}
                  </span>
                );

                return (
                  <th
                    key={col.label}
                    scope="col"
                    aria-sort={
                      active
                        ? sort.dir === "asc"
                          ? "ascending"
                          : "descending"
                        : undefined
                    }
                    className={cn(
                      "hairline-b text-eyebrow px-3 py-2 whitespace-nowrap",
                      col.align === "right" && "text-right",
                      col.hideBelow && `hidden ${col.hideBelow}`
                    )}
                  >
                    {col.key ? (
                      <Tooltip content={col.hint} side="bottom">
                        <button
                          type="button"
                          onClick={() => toggle(col.key as SortKey)}
                          className={cn(
                            "-mx-1 rounded-sm px-1 outline-none",
                            "transition-colors duration-150 ease-[var(--ease-out-quint)]",
                            "hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
                            active && "text-foreground"
                          )}
                        >
                          {header}
                        </button>
                      </Tooltip>
                    ) : col.hint ? (
                      <Tooltip content={col.hint} side="bottom">
                        <span className="cursor-help decoration-dotted underline-offset-4 hover:underline">
                          {header}
                        </span>
                      </Tooltip>
                    ) : (
                      header
                    )}
                  </th>
                );
              })}
              <th scope="col" className="hairline-b w-10 px-2 py-2">
                <span className="sr-only">Inspect</span>
              </th>
            </tr>
          </thead>

          <tbody>
            {visible.map((row, index) => {
              const level = normalizeRisk(row.risk_level);
              const style = RISK_STYLES[level];
              const balance = field.balance(row);
              const drain = balance > 0 ? Math.min(row.amount / balance, 1) : null;
              const selected = selectedId === row.transaction_id;
              const ticked = selection?.selected.has(row.transaction_id) ?? false;

              return (
                <tr
                  // Keyed by identity, which is what makes the entrance
                  // animation honest: React mounts each record exactly once, so
                  // the rise fires for a genuinely new row and never re-fires
                  // for the ones the poll simply pushed down.
                  key={`${row.transaction_id}-${row.id ?? ""}`}
                  onClick={() => onInspect(row)}
                  style={
                    { "--enter-index": Math.min(index, 12) } as React.CSSProperties
                  }
                  className={cn(
                    "enter-rise group/row cursor-pointer border-b border-border last:border-b-0",
                    "transition-colors duration-100 ease-[var(--ease-out-quint)]",
                    "hover:bg-inset",
                    selected && "bg-muted",
                    ticked && !selected && "bg-[var(--brand-wash)]"
                  )}
                >
                  <td
                    aria-hidden
                    className={cn("p-0", row.is_fraud ? style.rule : "bg-transparent")}
                  />

                  {selection ? (
                    <td
                      // The click is swallowed here: ticking a row for deletion
                      // and opening its audit trail are different intents, and
                      // the drawer sliding in over a bulk selection is the kind
                      // of surprise that ends in the wrong rows being deleted.
                      onClick={(e) => e.stopPropagation()}
                      className={cn("pr-1 pl-3 align-middle", cellY)}
                    >
                      <Checkbox
                        checked={ticked}
                        onCheckedChange={() => toggleRow(row.transaction_id)}
                        aria-label={`Select ${row.transaction_id}`}
                      />
                    </td>
                  ) : null}

                  <td className={cn("px-3 whitespace-nowrap", cellY)}>
                    <span
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-subheadline font-medium ring-1 ring-inset",
                        style.chip,
                        // The one animated affordance in the table, and it is
                        // reserved for the level that warrants an interruption.
                        level === "CRITICAL" && "glow-critical"
                      )}
                    >
                      <style.Icon aria-hidden className="size-3" />
                      {style.label}
                    </span>
                  </td>

                  <td className={cn("px-3", cellY)}>
                    <span className="block font-medium">
                      {truncateId(row.transaction_id, 12)}
                    </span>
                    <span className="block text-subheadline text-muted-foreground">
                      {/* Before mount there is no wall clock to measure against,
                          so the absolute stamp stands in for the relative one.
                          Both are true; only one needs a clock. */}
                      {now === null
                        ? formatTimestamp(field.at(row))
                        : formatRelative(field.at(row), now)}
                      {" · "}
                      {field.type(row)}
                    </span>
                  </td>

                  <td
                    className={cn(
                      "hidden px-3 whitespace-nowrap text-muted-foreground md:table-cell",
                      cellY
                    )}
                  >
                    {truncateId(row.account_id, 10)}
                  </td>

                  <td
                    className={cn(
                      "px-3 text-right font-medium whitespace-nowrap",
                      cellY
                    )}
                  >
                    {formatCurrency(row.amount, true)}
                  </td>

                  <td className={cn("hidden px-3 lg:table-cell", cellY)}>
                    {drain === null ? (
                      <span className="text-muted-foreground">No balance on file</span>
                    ) : (
                      <span className="flex items-center gap-2">
                        <span className="h-1 w-14 shrink-0 overflow-hidden rounded-full bg-track">
                          <span
                            className="block h-full rounded-r-sm"
                            style={{
                              width: `${Math.max(drain * 100, 2)}%`,
                              // A magnitude read, so one ordered ramp: neutral
                              // ink until the share is worth a second look, then
                              // the severity steps.
                              background:
                                drain > 0.9
                                  ? "var(--severity-critical)"
                                  : drain > 0.6
                                    ? "var(--severity-high)"
                                    : "var(--chart-2)",
                            }}
                          />
                        </span>
                        <span className="text-callout text-muted-foreground">
                          {formatDecimal(drain * 100, 0)}%
                        </span>
                      </span>
                    )}
                  </td>

                  <td
                    className={cn("hidden px-3 text-right lg:table-cell", cellY)}
                  >
                    {formatInteger(field.velocity(row))}
                  </td>

                  <td
                    className={cn(
                      "px-3 text-right whitespace-nowrap",
                      cellY,
                      row.autoencoder_mse > 0.05 &&
                        "font-medium text-[var(--severity-high)]"
                    )}
                  >
                    {formatDecimal(row.autoencoder_mse, 4)}
                  </td>

                  <td
                    className={cn(
                      "hidden px-3 text-right whitespace-nowrap xl:table-cell",
                      cellY,
                      row.isolation_score < 0 && "text-[var(--severity-high)]"
                    )}
                  >
                    {formatScore(row.isolation_score)}
                  </td>

                  <td
                    className={cn(
                      "hidden px-3 whitespace-nowrap text-muted-foreground xl:table-cell",
                      cellY
                    )}
                  >
                    {field.channel(row)}
                  </td>

                  <td
                    className={cn(
                      "hidden px-3 whitespace-nowrap text-muted-foreground 2xl:table-cell",
                      cellY
                    )}
                  >
                    {SOURCE_LABEL[rowSource(row)]}
                  </td>

                  <td className={cn("px-2 text-right", cellY)}>
                    <button
                      type="button"
                      aria-label={`Inspect ${row.transaction_id}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        onInspect(row);
                      }}
                      className={cn(
                        "pressable grid size-7 place-items-center rounded-lg text-muted-foreground outline-none",
                        "transition-colors duration-150 ease-[var(--ease-out-quint)]",
                        "hover:bg-card hover:text-foreground hover:ring-1 hover:ring-border",
                        "focus-visible:ring-2 focus-visible:ring-ring"
                      )}
                    >
                      <ChevronRight className="size-4" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Pager
        page={safePage}
        pageCount={pageCount}
        start={start}
        shown={visible.length}
        total={sorted.length}
        label="Transaction pages"
        onPage={setPage}
      />
    </div>
  );
}
