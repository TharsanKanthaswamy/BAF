"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, ChevronRight } from "lucide-react";

import { accountRollup, type AccountRollup } from "@/lib/analytics";
import {
  formatCompactCurrency,
  formatCurrency,
  formatInteger,
  formatPercent,
  truncateId,
} from "@/lib/format";
import { RISK_STYLES, riskRank } from "@/lib/risk";
import { useConsoleSettings } from "@/lib/settings";
import { cn } from "@/lib/utils";
import { EngineStatus } from "@/components/console/engine-status";
import { PageHeader, PageSections } from "@/components/console/page-header";
import { useConsoleData } from "@/components/console/use-console-data";
import { FilterBar } from "@/components/dashboard/filter-bar";
import { Pager } from "@/components/dashboard/pager";
import { Panel, PanelBleed, PanelHeader } from "@/components/dashboard/panel";
import { StatTile } from "@/components/dashboard/stat-tile";

type SortKey = "risk" | "count" | "flagged" | "exposure" | "average";

const COLUMNS: { key: SortKey | null; label: string; align?: "right" }[] = [
  { key: null, label: "Account" },
  { key: "risk", label: "Worst tier" },
  { key: "count", label: "Txns", align: "right" },
  { key: "flagged", label: "Flagged", align: "right" },
  { key: "average", label: "Average", align: "right" },
  { key: "exposure", label: "Value moved", align: "right" },
];

function sortValue(account: AccountRollup, key: SortKey): number {
  switch (key) {
    // Negated so that descending — the default direction — puts the worst tier
    // at the top, matching every other severity sort in the console.
    case "risk":
      return -riskRank(account.worst);
    case "count":
      return account.count;
    case "flagged":
      return account.flagged;
    case "exposure":
      return account.exposure;
    case "average":
      return account.count > 0 ? account.exposure / account.count : 0;
  }
}

/**
 * Accounts, not instructions.
 *
 * Fraud concentrates: a handful of mules move most of the value, and a single
 * account appearing four times at HIGH is a different problem from four unrelated
 * accounts appearing once each. The transaction queue cannot show that, because
 * its unit of work is one row. This page rolls the buffer up by account so the
 * concentration is the first thing on screen, and hands off to the queue with the
 * account already in the search box.
 */
export function AccountsView() {
  const router = useRouter();
  const { filtered, rows, channels, filters, setFilters, awaiting, stale } =
    useConsoleData();
  const { pageSize } = useConsoleSettings();

  const [sort, setSort] = React.useState<{ key: SortKey; dir: "asc" | "desc" }>({
    key: "risk",
    dir: "desc",
  });
  const [page, setPage] = React.useState(0);

  const accounts = React.useMemo(() => accountRollup(filtered), [filtered]);

  const summary = React.useMemo(() => {
    const exposure = accounts.reduce((sum, a) => sum + a.exposure, 0);
    const withFlags = accounts.filter((a) => a.flagged > 0).length;
    // Concentration: how much of the value the ten busiest accounts account for.
    // A near-100% reading on a wide buffer is the shape of a mule network.
    const top = [...accounts].sort((a, b) => b.exposure - a.exposure).slice(0, 10);
    const topExposure = top.reduce((sum, a) => sum + a.exposure, 0);
    return {
      exposure,
      withFlags,
      concentration: exposure > 0 ? topExposure / exposure : null,
      busiest: accounts.reduce(
        (max, a) => (a.count > max ? a.count : max),
        0
      ),
    };
  }, [accounts]);

  const sorted = React.useMemo(() => {
    const factor = sort.dir === "asc" ? 1 : -1;
    // `accountRollup` already returns worst-tier-first with flagged count and
    // value as tiebreaks, and `sort` is stable, so those tiebreaks survive
    // whichever column the analyst sorts by.
    return [...accounts].sort(
      (a, b) => (sortValue(a, sort.key) - sortValue(b, sort.key)) * factor
    );
  }, [accounts, sort]);

  // Clamped on read, as in the transaction table: a tighter filter can strand the
  // page index past the end of the set.
  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const start = safePage * pageSize;
  const visible = React.useMemo(
    () => sorted.slice(start, start + pageSize),
    [sorted, start, pageSize]
  );

  const toggle = (key: SortKey) => {
    setSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === "desc" ? "asc" : "desc" }
        : { key, dir: "desc" }
    );
    setPage(0);
  };

  /** Hand the account to the queue rather than opening a second detail surface. */
  const openInQueue = (accountId: string) => {
    setFilters({ ...filters, query: accountId });
    router.push("/transactions");
  };

  return (
    <PageSections>
      <PageHeader
        title="Accounts"
        description="The buffer rolled up by account. Ranked by the worst tier an account has reached, because one account seen four times at HIGH is a different case from four accounts seen once."
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
        <div className="overflow-hidden rounded-2xl bg-border ring-1 ring-border">
          <div className="grid gap-px sm:grid-cols-2 xl:grid-cols-4">
            <StatTile
              className="bg-card"
              label="Accounts in view"
              value={accounts.length}
              caption={`across ${formatInteger(filtered.length)} scored records`}
            />
            <StatTile
              className="bg-card"
              label="Carrying a flag"
              value={summary.withFlags}
              caption={
                accounts.length > 0
                  ? `${formatPercent(summary.withFlags / accounts.length, 0)} of accounts in view`
                  : "nothing in view"
              }
            />
            <StatTile
              className="bg-card"
              label="Top 10 concentration"
              value={summary.concentration}
              format={{ style: "percent", maximumFractionDigits: 0 }}
              fallback="No value"
              caption="share of value moved by the ten largest"
            />
            <StatTile
              className="bg-card"
              label="Busiest account"
              value={summary.busiest}
              caption="instructions from a single account"
            />
          </div>
        </div>

        <Panel>
          <PanelHeader
            eyebrow="Concentration"
            title={
              accounts.length === 0
                ? "No accounts in view"
                : `${formatInteger(accounts.length)} account${accounts.length === 1 ? "" : "s"} · ${formatCompactCurrency(summary.exposure)} moved`
            }
            description="Selecting a row opens the transaction queue filtered to that account."
          />
          <PanelBleed>
            {accounts.length === 0 ? (
              <div className="grid min-h-[12rem] place-items-center px-5 pb-5 text-center">
                <p className="max-w-sm text-body text-muted-foreground">
                  Nothing matches the current filters. Reset them, or inject a
                  synthetic burst from the simulator to put traffic on the wire.
                </p>
              </div>
            ) : (
              <div className="flex min-w-0 flex-col">
                <div className="scroll-thin figures-tabular max-h-[42rem] overflow-auto">
                  <table className="w-full border-collapse text-left text-body">
                    <caption className="sr-only">
                      Accounts in the current slice, page {safePage + 1} of{" "}
                      {pageCount}. Each row opens the transaction queue filtered to
                      that account.
                    </caption>
                    <thead className="material-head sticky top-0 z-10">
                      <tr>
                        <th scope="col" className="w-0.5 p-0" />
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
                                <Arrow
                                  aria-hidden
                                  className="size-3 text-foreground"
                                />
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
                                "border-b border-border px-3 py-2 text-subheadline font-medium whitespace-nowrap text-[var(--ink-muted)]",
                                col.align === "right" && "text-right"
                              )}
                            >
                              {col.key ? (
                                <button
                                  type="button"
                                  onClick={() => toggle(col.key as SortKey)}
                                  className={cn(
                                    "-mx-1 rounded px-1 outline-none",
                                    "transition-colors duration-150 ease-[var(--ease-out-quint)]",
                                    "hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
                                    active && "text-foreground"
                                  )}
                                >
                                  {header}
                                </button>
                              ) : (
                                header
                              )}
                            </th>
                          );
                        })}
                        <th scope="col" className="w-10 px-2 py-2">
                          <span className="sr-only">Open in queue</span>
                        </th>
                      </tr>
                    </thead>

                    <tbody>
                      {visible.map((account, index) => {
                        const style = RISK_STYLES[account.worst];
                        const average =
                          account.count > 0 ? account.exposure / account.count : 0;

                        return (
                          <tr
                            key={account.accountId}
                            onClick={() => openInQueue(account.accountId)}
                            // The same arrival the queue's rows get. Capped at 12
                            // so a full page does not end on a delay long enough
                            // to read as the table loading twice; React keys these
                            // by account id, so a row that survives a refresh
                            // never remounts and never replays.
                            style={
                              { "--enter-index": Math.min(index, 12) } as React.CSSProperties
                            }
                            className={cn(
                              "enter-rise cursor-pointer border-b border-border last:border-b-0",
                              "transition-colors duration-100 ease-[var(--ease-out-quint)]",
                              "hover:bg-inset"
                            )}
                          >
                            <td
                              aria-hidden
                              className={cn(
                                "p-0",
                                account.flagged > 0 ? style.rule : "bg-transparent"
                              )}
                            />

                            <th
                              scope="row"
                              className="px-3 py-2 text-left font-medium whitespace-nowrap"
                            >
                              {truncateId(account.accountId, 18)}
                            </th>

                            <td className="px-3 py-2 whitespace-nowrap">
                              <span
                                className={cn(
                                  "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-subheadline font-medium ring-1 ring-inset",
                                  style.chip
                                )}
                              >
                                <style.Icon aria-hidden className="size-3" />
                                {style.label}
                              </span>
                            </td>

                            <td className="px-3 py-2 text-right">
                              {formatInteger(account.count)}
                            </td>

                            <td className="px-3 py-2 text-right">
                              {account.flagged > 0 ? (
                                <span className="font-medium text-[var(--severity-high)]">
                                  {formatInteger(account.flagged)}
                                </span>
                              ) : (
                                <span className="text-muted-foreground">0</span>
                              )}
                            </td>

                            <td className="px-3 py-2 text-right whitespace-nowrap text-muted-foreground">
                              {formatCurrency(average)}
                            </td>

                            <td className="px-3 py-2 text-right font-medium whitespace-nowrap">
                              {formatCurrency(account.exposure, true)}
                            </td>

                            <td className="px-2 py-2 text-right">
                              <button
                                type="button"
                                aria-label={`Open ${account.accountId} in the transaction queue`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openInQueue(account.accountId);
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
                  unit="Accounts"
                  label="Account pages"
                  onPage={setPage}
                />
              </div>
            )}
          </PanelBleed>
        </Panel>
      </div>
    </PageSections>
  );
}
