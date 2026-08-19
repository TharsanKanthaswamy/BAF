"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import type { AccountRollup } from "@/lib/analytics";
import {
  formatCompactCurrency,
  formatCurrency,
  formatInteger,
  formatRelative,
  formatTimestamp,
  truncateId,
} from "@/lib/format";
import { field, normalizeRisk, RISK_STYLES, riskRank } from "@/lib/risk";
import type { RiskLevel, TransactionRecord } from "@/lib/types";
import { cn } from "@/lib/utils";
import { EngineStatus } from "@/components/console/engine-status";
import { PageHeader, PageSections } from "@/components/console/page-header";
import { useConsoleData } from "@/components/console/use-console-data";
import { KpiRow } from "@/components/dashboard/kpi-row";
import { Panel, PanelBleed, PanelFooter, PanelHeader } from "@/components/dashboard/panel";
import { RiskMix } from "@/components/dashboard/risk-mix";
import { TransactionDetail } from "@/components/dashboard/transaction-detail";
import { VelocityChart } from "@/components/dashboard/velocity-chart";

/** A link out of a summary panel to the page that owns the full set. */
function SeeAll({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={cn(
        "pressable ml-auto inline-flex items-center gap-1 rounded-lg px-1.5 py-0.5 text-callout font-medium outline-none",
        "transition-colors duration-150 ease-[var(--ease-out-quint)]",
        "hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
      )}
    >
      {children}
      <ArrowRight aria-hidden className="size-3.5" />
    </Link>
  );
}

/**
 * The shift-opening read: what is at stake, what needs a human, how the stream is
 * behaving, and the two shortest paths into the work.
 *
 * It deliberately does not try to be the whole console. Everything here is a
 * summary with a way through to the page that owns the detail — which is the
 * difference between an overview and the single squeezed page this replaces.
 */
export function OverviewView() {
  const {
    rows,
    ordered,
    analytics,
    filters,
    setFilters,
    now,
    awaiting,
    stale,
    isConnected,
    deleteRows,
  } = useConsoleData();

  const [selected, setSelected] = React.useState<TransactionRecord | null>(null);

  const setRisk = (risk: RiskLevel | "ALL") => setFilters({ ...filters, risk });

  // Worst tier first, recency as the tiebreak. `riskRank` counts up from 0 at
  // CRITICAL, so ascending rank is descending severity.
  const worst = React.useMemo(
    () =>
      ordered
        .filter((row) => row.is_fraud)
        .sort((a, b) => riskRank(a.risk_level) - riskRank(b.risk_level))
        .slice(0, 6),
    [ordered]
  );

  return (
    <PageSections>
      <PageHeader
        title="Overview"
        description="An autoencoder, an isolation forest and a deterministic rule set score every instruction. This is the state of the buffer they have produced; the queue pages are where the work happens."
      />

      <EngineStatus />

      {/* Held at reduced opacity rather than swapped for a skeleton: the figures
          on screen are real, they are simply not current. */}
      <div className={cn("space-y-4", (awaiting || stale) && "is-restating")}>
        <KpiRow analytics={analytics} />

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_23rem]">
          <VelocityChart analytics={analytics} />
          <RiskMix
            slices={analytics.riskMix}
            total={analytics.total}
            activeRisk={filters.risk}
            onSelectRisk={setRisk}
          />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Panel>
            <PanelHeader
              eyebrow="Work queue"
              title="Worst open cases"
              description="Flagged instructions ordered by tier, then by recency."
              actions={<SeeAll href="/alerts">All alerts</SeeAll>}
            />
            <PanelBleed>
              {worst.length === 0 ? (
                <p className="px-5 pb-5 text-body text-muted-foreground">
                  {isConnected
                    ? "Nothing flagged in the current slice. Widen the filters or inject a synthetic burst to exercise the models."
                    : "No flagged cases to show while the engine is unreachable."}
                </p>
              ) : (
                <ul className="hairline-t">
                  {worst.map((row) => {
                    const style = RISK_STYLES[normalizeRisk(row.risk_level)];
                    return (
                      <li key={`${row.transaction_id}-${row.id ?? ""}`}>
                        <button
                          type="button"
                          onClick={() => setSelected(row)}
                          className={cn(
                            "hairline-b flex w-full items-center gap-3 px-5 py-2.5 text-left outline-none",
                            "transition-colors duration-150 ease-[var(--ease-out-quint)]",
                            "hover:bg-inset focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                          )}
                        >
                          <span
                            className={cn(
                              "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-subheadline font-medium ring-1 ring-inset",
                              style.chip
                            )}
                          >
                            <style.Icon aria-hidden className="size-3" />
                            {style.label}
                          </span>

                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-body font-medium">
                              {truncateId(row.transaction_id, 14)}
                            </span>
                            <span className="block truncate text-subheadline text-muted-foreground">
                              {now === null
                                ? formatTimestamp(field.at(row))
                                : formatRelative(field.at(row), now)}
                              {" · "}
                              {truncateId(row.account_id, 10)}
                            </span>
                          </span>

                          <span className="figures-tabular shrink-0 text-body font-medium">
                            {formatCurrency(row.amount)}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </PanelBleed>
            <PanelFooter>
              <span>
                {formatInteger(analytics.flagged)} flagged of{" "}
                {formatInteger(analytics.total)} scored in view
              </span>
            </PanelFooter>
          </Panel>

          <Panel>
            <PanelHeader
              eyebrow="Concentration"
              title="Accounts carrying the exposure"
              description="Ranked by worst tier reached, then by how often they appear."
              actions={<SeeAll href="/accounts">All accounts</SeeAll>}
            />
            <PanelBleed>
              {analytics.topAccounts.length === 0 ? (
                <p className="px-5 pb-5 text-body text-muted-foreground">
                  No accounts in the current slice.
                </p>
              ) : (
                <AccountList accounts={analytics.topAccounts} />
              )}
            </PanelBleed>
            <PanelFooter>
              <span>
                {formatInteger(analytics.accounts)} distinct account
                {analytics.accounts === 1 ? "" : "s"} across{" "}
                {formatInteger(rows.length)} buffered records
              </span>
            </PanelFooter>
          </Panel>
        </div>
      </div>

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

/** The compact form of the accounts table. The full one lives on `/accounts`. */
function AccountList({ accounts }: { accounts: AccountRollup[] }) {
  return (
    // Four columns, one of them an account id — at 360px the row's min-content
    // width exceeds the card, and with no scroll parent that overflow escapes the
    // rounded corner and widens the document. The two other compact tables in the
    // console already sit in a scroll container; this one was the exception.
    <div className="scroll-thin overflow-x-auto">
      <table className="figures-tabular w-full border-collapse text-body">
        <caption className="sr-only">
          Accounts ranked by worst risk tier reached, with transaction count and
          total value moved.
        </caption>
        <thead>
          <tr className="hairline-b hairline-t text-eyebrow">
            <th scope="col" className="px-5 py-1.5 text-left">
              Account
            </th>
            <th scope="col" className="px-3 py-1.5 text-right">
              Txns
            </th>
            <th scope="col" className="px-3 py-1.5 text-right">
              Flagged
            </th>
            <th scope="col" className="px-5 py-1.5 text-right">
              Value
            </th>
          </tr>
        </thead>
        <tbody>
          {accounts.map((account) => {
            const style = RISK_STYLES[account.worst];
            return (
              <tr key={account.accountId} className="hairline-b">
                <th scope="row" className="px-5 py-2 text-left font-normal">
                  <span className="flex items-center gap-2">
                    <style.Icon
                      aria-hidden
                      className={cn("size-3.5 shrink-0", style.fg)}
                    />
                    <span className="truncate font-medium">
                      {truncateId(account.accountId, 14)}
                    </span>
                    {/* The tier is named, not just tinted — two of the four steps
                        sit under 3:1 on the light surface. */}
                    <span className="shrink-0 text-subheadline text-muted-foreground">
                      {style.label}
                    </span>
                  </span>
                </th>
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
                <td className="px-5 py-2 text-right text-muted-foreground">
                  {formatCompactCurrency(account.exposure)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
