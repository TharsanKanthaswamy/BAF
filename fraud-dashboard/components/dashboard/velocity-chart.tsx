"use client";

import * as React from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Activity, Radio, TrendingUp, Zap } from "lucide-react";

import type { Analytics, VelocityBucket } from "@/lib/analytics";
import { formatCompactCurrency, formatInteger, formatPercent } from "@/lib/format";
import { usePrefersReducedMotion } from "@/lib/hooks";
import {
  AXIS,
  ChartLegend,
  ChartTooltipCard,
  ChartTooltipRow,
  ViewToggle,
  type ChartView,
  type SeriesSpec,
} from "@/components/dashboard/chart-parts";
import {
  Panel,
  PanelBody,
  PanelFooter,
  PanelHeader,
} from "@/components/dashboard/panel";
import { cn } from "@/lib/utils";

const SERIES: SeriesSpec[] = [
  { key: "count", label: "Transactions Scored", color: "var(--chart-2, #3b82f6)" },
  {
    key: "flagged",
    label: "Flagged by Ensemble",
    color: "var(--severity-high, #ef4444)",
  },
];

function bucketWidthLabel(bucketMs: number): string {
  if (bucketMs < 60_000) return `${Math.max(1, Math.round(bucketMs / 1000))}s`;
  if (bucketMs < 60 * 60_000) return `${Math.max(1, Math.round(bucketMs / 60_000))}m`;
  if (bucketMs < 24 * 60 * 60_000) return `${Math.max(1, Math.round(bucketMs / (60 * 60_000)))}h`;
  return `${Math.max(1, Math.round(bucketMs / (24 * 60 * 60_000)))}d`;
}

export function VelocityChart({
  analytics,
  className,
}: {
  analytics: Analytics;
  className?: string;
}) {
  const [view, setView] = React.useState<ChartView>("chart");
  const reduced = usePrefersReducedMotion();
  const [animate, setAnimate] = React.useState(true);

  const { buckets, bucketMs, peakVelocity, total, flagged } = analytics;
  const width = bucketWidthLabel(bucketMs);
  const hasVolume = buckets.some((b) => b.count > 0);

  const avgVelocity =
    buckets.length > 0
      ? Math.round(buckets.reduce((acc, b) => acc + b.count, 0) / buckets.length)
      : 0;

  return (
    <Panel className={cn("overflow-hidden border border-border/80 shadow-sm", className)}>
      <PanelHeader
        eyebrow={
          <span className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 font-semibold text-primary">
              <Activity className="size-3.5" />
              Stream Velocity Analytics
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-500 ring-1 ring-emerald-500/20 ring-inset">
              <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Real-Time Feed
            </span>
          </span>
        }
        title={
          <span className="flex flex-wrap items-baseline gap-2">
            <span>Transaction Flow &amp; Anomaly Surge</span>
            <span className="text-sm font-normal text-muted-foreground">
              ({width} resolution)
            </span>
          </span>
        }
        description="Continuous rolling frequency of all processed instructions against ensemble anomaly spikes."
        actions={
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2 text-xs">
              <span className="inline-flex items-center gap-1 rounded-lg bg-secondary/80 px-2 py-1 font-mono text-muted-foreground border border-border/50">
                <TrendingUp className="size-3 text-blue-500" />
                Peak: <strong className="text-foreground">{formatInteger(peakVelocity)}</strong>/bkt
              </span>
              <span className="inline-flex items-center gap-1 rounded-lg bg-secondary/80 px-2 py-1 font-mono text-muted-foreground border border-border/50">
                <Zap className="size-3 text-amber-500" />
                Avg: <strong className="text-foreground">{formatInteger(avgVelocity)}</strong>/bkt
              </span>
            </div>
            <ViewToggle value={view} onChange={setView} />
          </div>
        }
      />

      <PanelBody className="pb-3 pt-2">
        {!hasVolume ? (
          <div className="grid h-[16rem] place-items-center rounded-xl bg-inset text-center border border-dashed border-border/60">
            <div className="space-y-1.5 px-6">
              <Radio className="size-6 text-muted-foreground/60 mx-auto" />
              <p className="max-w-xs text-body font-medium text-muted-foreground">
                No transactions in this time window.
              </p>
              <p className="text-xs text-muted-foreground/80">
                Inject a synthetic burst or adjust filters to populate the stream.
              </p>
            </div>
          </div>
        ) : view === "chart" ? (
          <div className="figures-tabular h-[16.5rem] w-full pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={buckets}
                margin={{ top: 12, right: 12, bottom: 0, left: -10 }}
                accessibilityLayer
              >
                <defs>
                  <linearGradient id="velocity-count-grad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.35} />
                    <stop offset="60%" stopColor="#3b82f6" stopOpacity={0.12} />
                    <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.0} />
                  </linearGradient>
                  <linearGradient id="velocity-flagged-grad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#ef4444" stopOpacity={0.5} />
                    <stop offset="50%" stopColor="#ef4444" stopOpacity={0.2} />
                    <stop offset="100%" stopColor="#ef4444" stopOpacity={0.0} />
                  </linearGradient>
                  <filter id="glow-flagged" x="-20%" y="-20%" width="140%" height="140%">
                    <feGaussianBlur stdDeviation="3" result="glow" />
                    <feMerge>
                      <feMergeNode in="glow" />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>
                </defs>

                <CartesianGrid
                  vertical={false}
                  stroke={AXIS.grid}
                  strokeDasharray="3 3"
                  strokeOpacity={0.6}
                />

                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={{ stroke: AXIS.line, strokeOpacity: 0.8 }}
                  tick={{ ...AXIS.tick, fontSize: 11 }}
                  minTickGap={32}
                  interval="preserveStartEnd"
                  padding={{ left: 10, right: 10 }}
                />
                <YAxis
                  allowDecimals={false}
                  width={38}
                  tickLine={false}
                  axisLine={false}
                  tick={{ ...AXIS.tick, fontSize: 11 }}
                />

                {peakVelocity > 0 && (
                  <ReferenceLine
                    y={peakVelocity}
                    stroke="var(--border)"
                    strokeDasharray="4 4"
                    strokeOpacity={0.5}
                  />
                )}

                <Tooltip
                  cursor={{ stroke: "var(--border)", strokeWidth: 1.5, strokeDasharray: "3 3" }}
                  isAnimationActive={false}
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const bucket = payload[0].payload as VelocityBucket;
                    const rate = bucket.count > 0 ? (bucket.flagged / bucket.count) * 100 : 0;
                    return (
                      <ChartTooltipCard title={`Time: ${bucket.label}`}>
                        <ChartTooltipRow
                          color="#3b82f6"
                          label="Total Scored"
                          value={`${formatInteger(bucket.count)} txns`}
                        />
                        <ChartTooltipRow
                          color="#ef4444"
                          label="Anomalies Flagged"
                          value={`${formatInteger(bucket.flagged)} (${rate.toFixed(1)}%)`}
                        />
                        <ChartTooltipRow
                          color="#10b981"
                          label="Volume Processed"
                          value={formatCompactCurrency(bucket.value)}
                        />
                        {bucket.exposure > 0 && (
                          <ChartTooltipRow
                            color="#f59e0b"
                            label="Value At Risk"
                            value={formatCompactCurrency(bucket.exposure)}
                          />
                        )}
                      </ChartTooltipCard>
                    );
                  }}
                />

                <Area
                  type="monotone"
                  dataKey="count"
                  name="Transactions Scored"
                  stroke="#3b82f6"
                  strokeWidth={2.5}
                  fill="url(#velocity-count-grad)"
                  dot={false}
                  activeDot={{
                    r: 5,
                    fill: "#3b82f6",
                    stroke: "var(--card)",
                    strokeWidth: 2.5,
                  }}
                  isAnimationActive={animate && !reduced}
                  animationDuration={600}
                  animationEasing="ease-out"
                  onAnimationEnd={() => setAnimate(false)}
                />
                <Area
                  type="monotone"
                  dataKey="flagged"
                  name="Flagged by Ensemble"
                  stroke="#ef4444"
                  strokeWidth={2.5}
                  fill="url(#velocity-flagged-grad)"
                  dot={false}
                  activeDot={{
                    r: 5,
                    fill: "#ef4444",
                    stroke: "var(--card)",
                    strokeWidth: 2.5,
                  }}
                  isAnimationActive={animate && !reduced}
                  animationDuration={600}
                  animationEasing="ease-out"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <VelocityTable buckets={buckets} />
        )}
      </PanelBody>

      <PanelFooter className="bg-secondary/20">
        <ChartLegend series={SERIES} />
        <div className="ml-auto flex items-center gap-3 text-xs text-muted-foreground font-mono">
          <span>{formatInteger(buckets.length)} time buckets</span>
          <span>·</span>
          <span>{formatPercent(total > 0 ? flagged / total : 0, 1)} aggregate flag rate</span>
        </div>
      </PanelFooter>
    </Panel>
  );
}

function VelocityTable({ buckets }: { buckets: VelocityBucket[] }) {
  const rows = [...buckets].reverse();
  const maxCount = Math.max(...buckets.map((b) => b.count), 1);

  return (
    <div className="scroll-thin figures-tabular h-[16.5rem] overflow-y-auto rounded-xl border border-border/80 bg-card">
      <table className="w-full border-collapse text-callout">
        <caption className="sr-only">
          Transactions scored, transactions flagged, and value moved per time bucket.
        </caption>
        <thead className="sticky top-0 z-10 bg-secondary/80 backdrop-blur-sm border-b border-border">
          <tr className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
            <th scope="col" className="px-3 py-2 text-left">Time Bucket</th>
            <th scope="col" className="px-3 py-2 text-right">Scored</th>
            <th scope="col" className="px-3 py-2 text-right">Flagged</th>
            <th scope="col" className="px-3 py-2 text-right">Density</th>
            <th scope="col" className="px-3 py-2 text-right">Value Moved</th>
            <th scope="col" className="px-3 py-2 text-right">Value At Risk</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/50 text-xs">
          {rows.map((b) => {
            const pct = Math.min(100, Math.round((b.count / maxCount) * 100));
            const flagPct = b.count > 0 ? ((b.flagged / b.count) * 100).toFixed(0) : "0";
            return (
              <tr key={b.timestamp} className="hover:bg-muted/40 transition-colors">
                <td className="px-3 py-2 font-mono font-medium text-foreground">{b.label}</td>
                <td className="px-3 py-2 text-right font-medium">{formatInteger(b.count)}</td>
                <td className={cn("px-3 py-2 text-right font-medium", b.flagged > 0 ? "text-red-500 font-bold" : "text-muted-foreground")}>
                  {formatInteger(b.flagged)} ({flagPct}%)
                </td>
                <td className="px-3 py-2 text-right w-28">
                  <div className="flex items-center justify-end gap-2">
                    <div className="h-1.5 w-16 overflow-hidden rounded-full bg-secondary">
                      <div
                        className={cn(
                          "h-full rounded-full transition-all",
                          b.flagged > 0 ? "bg-red-500" : "bg-blue-500"
                        )}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="font-mono text-[10px] text-muted-foreground w-7 text-right">{pct}%</span>
                  </div>
                </td>
                <td className="px-3 py-2 text-right text-muted-foreground">{formatCompactCurrency(b.value)}</td>
                <td className={cn("px-3 py-2 text-right", b.exposure > 0 ? "text-amber-500 font-semibold" : "text-muted-foreground")}>
                  {formatCompactCurrency(b.exposure)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
