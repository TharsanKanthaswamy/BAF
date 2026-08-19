"use client";

import * as React from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Binary, Cpu, Sparkles, Target } from "lucide-react";

import type { EngineMetrics } from "@/lib/api";
import type { Analytics } from "@/lib/analytics";
import { formatDecimal, formatInteger, formatPercent, formatScore } from "@/lib/format";
import { usePrefersReducedMotion } from "@/lib/hooks";
import { triageSignals } from "@/lib/risk";
import type { TransactionRecord } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Tooltip as HintTooltip } from "@/components/ui/tooltip";
import {
  AXIS,
  ChartTooltipCard,
  ChartTooltipRow,
  ViewToggle,
  type ChartView,
} from "@/components/dashboard/chart-parts";
import {
  Panel,
  PanelBody,
  PanelFooter,
  PanelHeader,
} from "@/components/dashboard/panel";

const MSE_THRESHOLD = 0.05;
const BIN_COUNT = 14;

/**
 * Metrics fixed at training time. They are not recomputed from live traffic.
 *
 * The engine reports the first two on `GET /metrics`, so when the caller has that
 * response the served figures are used verbatim; the literals below are only the
 * fallback for a page that has not asked the engine, or cannot reach it. Printing
 * a stale constant next to live traffic and letting a reviewer assume it was
 * measured on that traffic is exactly the kind of quiet lie a fraud console
 * cannot afford.
 */
function trainingMetrics(metrics: EngineMetrics | null | undefined) {
  return [
    {
      label: "Silhouette score",
      value: metrics
        ? formatDecimal(metrics.silhouette_score, 4)
        : "0.5915",
      hint: "K-means separation on the training features. Measured once, at fit time.",
    },
    {
      label: "Contamination",
      value: metrics
        ? formatPercent(metrics.contamination_rate_mean, 2)
        : "0.79%",
      hint: "The outlier fraction the Isolation Forest was fitted with.",
    },
    {
      label: "Rule set",
      value: "7 rules",
      hint: "Deterministic checks applied after both models, independent of either score.",
    },
  ];
}

interface Bin {
  label: string;
  from: number;
  to: number;
  count: number;
  beyond: boolean;
}

function buildBins(rows: TransactionRecord[]): Bin[] {
  const values = rows
    .map((r) => r.autoencoder_mse)
    .filter((v): v is number => Number.isFinite(v));

  const upper = Math.max(MSE_THRESHOLD * 2, ...values);
  const step = upper / BIN_COUNT;

  const bins: Bin[] = Array.from({ length: BIN_COUNT }, (_, i) => {
    const from = i * step;
    const to = from + step;
    return {
      from,
      to,
      // Only every other bin gets a printed edge — 14 labels at this width
      // would collide, and the reference line carries the value that matters.
      label: i % 2 === 0 ? formatDecimal(from, 3) : "",
      count: 0,
      beyond: from >= MSE_THRESHOLD,
    };
  });

  for (const value of values) {
    const index = Math.min(BIN_COUNT - 1, Math.max(0, Math.floor(value / step)));
    bins[index].count += 1;
  }

  return bins;
}

function StageCard({
  Icon,
  name,
  role,
  readout,
  detail,
  tone,
}: {
  Icon: React.ComponentType<{ className?: string }>;
  name: string;
  role: string;
  readout: string;
  detail: string;
  tone?: "alert";
}) {
  return (
    <li className="min-w-0 rounded-xl bg-inset p-3">
      <div className="mb-1.5 flex items-center gap-2">
        <Icon className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="text-body font-medium">{name}</span>
      </div>
      <p
        className={cn(
          "figures-tabular text-title-2 leading-none font-semibold",
          tone === "alert" && "text-[var(--severity-high)]"
        )}
      >
        {readout}
      </p>
      <p className="mt-1 text-subheadline leading-snug text-muted-foreground">
        {detail}
      </p>
      <p className="mt-1.5 text-subheadline leading-snug text-[var(--ink-muted)]">
        {role}
      </p>
    </li>
  );
}

/**
 * The engine is four layers, and a verdict is only trustworthy if you can see
 * what each one contributed. Live figures come from the filtered slice; the
 * fixed training-time metrics are labelled as such rather than presented as if
 * they were measured on the traffic on screen.
 */
export function ModelDiagnostics({
  rows,
  analytics,
  metrics,
  className,
}: {
  rows: TransactionRecord[];
  analytics: Analytics;
  /** `GET /metrics`, when the caller has it. Falls back to the fitted literals. */
  metrics?: EngineMetrics | null;
  className?: string;
}) {
  const [view, setView] = React.useState<ChartView>("chart");
  const reduced = usePrefersReducedMotion();

  const bins = React.useMemo(() => buildBins(rows), [rows]);
  const fitted = React.useMemo(() => trainingMetrics(metrics), [metrics]);

  const stats = React.useMemo(() => {
    let beyondMse = 0;
    let negativeIso = 0;
    let ruleHits = 0;
    let narrated = 0;

    for (const row of rows) {
      if (row.autoencoder_mse > MSE_THRESHOLD) beyondMse += 1;
      if (row.isolation_score < 0) negativeIso += 1;
      if (row.ai_explanation) narrated += 1;
      const signals = triageSignals(row);
      if (signals[0]?.label !== "No rule triggered") ruleHits += signals.length;
    }

    return { beyondMse, negativeIso, ruleHits, narrated };
  }, [rows]);

  const hasRows = rows.length > 0;

  return (
    <Panel className={className}>
      <PanelHeader
        eyebrow="Ensemble"
        title="How each layer voted"
        description="Two unsupervised models and a deterministic rule set score every record independently; the narration layer explains the outcome afterwards."
        actions={
          hasRows ? <ViewToggle value={view} onChange={setView} /> : undefined
        }
      />

      <PanelBody className="space-y-5">
        <ul className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
          <StageCard
            Icon={Cpu}
            name="Autoencoder"
            readout={formatDecimal(analytics.avgMse, 4)}
            detail={`Mean reconstruction error · ${formatInteger(stats.beyondMse)} beyond 0.0500`}
            role="Learns normal behaviour, then measures how badly a record fails to reconstruct."
            tone={stats.beyondMse > 0 ? "alert" : undefined}
          />
          <StageCard
            Icon={Binary}
            name="Isolation Forest"
            readout={formatScore(analytics.avgIsolation)}
            detail={`Mean score · ${formatInteger(stats.negativeIso)} separate as outliers`}
            role="Splits the feature space at random; records that isolate in few splits are anomalous."
            tone={stats.negativeIso > 0 ? "alert" : undefined}
          />
          <StageCard
            Icon={Target}
            name="Rule set"
            readout={formatInteger(stats.ruleHits)}
            detail={`Rule triggers across ${formatInteger(rows.length)} records`}
            role="Amount, balance drain, velocity, login failures and session speed, all checked deterministically."
          />
          <StageCard
            Icon={Sparkles}
            name="Narration"
            readout={
              analytics.flagged > 0
                ? formatPercent(
                    Math.min(stats.narrated / analytics.flagged, 1),
                    0
                  )
                : "n/a"
            }
            detail={`${formatInteger(stats.narrated)} of ${formatInteger(analytics.flagged)} flagged records narrated`}
            role="Groq-hosted LLaMA 3.3 turns the numeric verdict into a reviewer-readable rationale."
          />
        </ul>

        <div className="space-y-2">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-body font-medium">
              Reconstruction error distribution
            </h3>
            <p className="text-callout text-muted-foreground">
              Bins past the review threshold carry the colour. Everything inside
              it stays neutral.
            </p>
          </div>

          {!hasRows ? (
            <div className="grid h-[11rem] place-items-center rounded-xl bg-inset">
              <p className="max-w-xs px-6 text-center text-body text-muted-foreground">
                No records in this slice to build a distribution from.
              </p>
            </div>
          ) : view === "chart" ? (
            <div className="figures-tabular h-[11rem] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={bins}
                  margin={{ top: 6, right: 6, bottom: 0, left: 0 }}
                  barCategoryGap={2}
                  accessibilityLayer
                >
                  <CartesianGrid vertical={false} stroke={AXIS.grid} />
                  <XAxis
                    dataKey="label"
                    tickLine={false}
                    axisLine={{ stroke: AXIS.line }}
                    tick={AXIS.tick}
                    interval={0}
                  />
                  <YAxis
                    allowDecimals={false}
                    width={30}
                    tickLine={false}
                    axisLine={false}
                    tick={AXIS.tick}
                  />
                  <Tooltip
                    cursor={{ fill: "color-mix(in oklab, var(--foreground) 5%, transparent)" }}
                    isAnimationActive={false}
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const bin = payload[0].payload as Bin;
                      return (
                        <ChartTooltipCard
                          title={`MSE ${formatDecimal(bin.from, 4)} to ${formatDecimal(bin.to, 4)}`}
                        >
                          <ChartTooltipRow
                            color={bin.beyond ? "var(--severity-high)" : "var(--chart-3)"}
                            label="Records"
                            value={formatInteger(bin.count)}
                          />
                          <ChartTooltipRow
                            label="Threshold"
                            value={bin.beyond ? "Beyond" : "Within"}
                          />
                        </ChartTooltipCard>
                      );
                    }}
                  />
                  <ReferenceLine
                    x={formatDecimal(MSE_THRESHOLD, 3)}
                    stroke="var(--severity-high)"
                    strokeWidth={1.5}
                    label={{
                      value: "0.05 review threshold",
                      position: "insideTopRight",
                      fill: "var(--severity-high)",
                      fontSize: 10,
                    }}
                  />
                  <Bar
                    dataKey="count"
                    name="Records"
                    radius={[4, 4, 0, 0]}
                    isAnimationActive={!reduced}
                    animationDuration={420}
                  >
                    {bins.map((bin) => (
                      <Cell
                        key={`${bin.from}`}
                        fill={bin.beyond ? "var(--severity-high)" : "var(--chart-3)"}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <BinTable bins={bins} />
          )}
        </div>
      </PanelBody>

      <PanelFooter className="gap-x-6">
        {fitted.map((metric) => (
          <HintTooltip key={metric.label} content={metric.hint} side="top">
            <span className="flex cursor-help items-center gap-1.5">
              <span className="text-[var(--ink-muted)]">{metric.label}</span>
              <span className="figures-tabular font-medium text-foreground">
                {metric.value}
              </span>
            </span>
          </HintTooltip>
        ))}
        <Badge variant="outline" size="sm" className="ml-auto">
          Fixed at training time
        </Badge>
      </PanelFooter>
    </Panel>
  );
}

function BinTable({ bins }: { bins: Bin[] }) {
  return (
    <div className="scroll-thin figures-tabular h-[11rem] overflow-y-auto rounded-xl ring-1 ring-inset ring-border">
      <table className="w-full border-collapse text-callout">
        <caption className="sr-only">
          Count of records per autoencoder reconstruction-error bin.
        </caption>
        <thead className="material-head sticky top-0 z-10">
          <tr className="text-subheadline text-[var(--ink-muted)]">
            <th scope="col" className="px-3 py-2 text-left font-medium">
              MSE range
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              Records
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              Threshold
            </th>
          </tr>
        </thead>
        <tbody>
          {bins.map((bin) => (
            <tr
              key={bin.from}
              className="border-t border-border first:border-t-0"
            >
              <th
                scope="row"
                className="px-3 py-1.5 text-left font-normal text-muted-foreground"
              >
                {formatDecimal(bin.from, 4)} to {formatDecimal(bin.to, 4)}
              </th>
              <td className="px-3 py-1.5 text-right">
                {formatInteger(bin.count)}
              </td>
              <td className="px-3 py-1.5 text-right text-muted-foreground">
                {bin.beyond ? (
                  <span className="font-medium text-[var(--severity-high)]">
                    Beyond
                  </span>
                ) : (
                  "Within"
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
