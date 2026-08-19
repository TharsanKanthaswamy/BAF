"use client";

import * as React from "react";
import NumberFlow, { type Format } from "@number-flow/react";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";

import { usePrefersReducedMotion } from "@/lib/hooks";
import { cn } from "@/lib/utils";

/**
 * A sparkline is a shape, not a chart: no axes, no labels, no tooltip. Drawn by
 * hand rather than through a chart library because it renders once per tile and
 * a full chart runtime for eleven points is waste.
 */
function Sparkline({
  values,
  color = "var(--chart-2)",
  className,
}: {
  values: number[];
  color?: string;
  className?: string;
}) {
  const id = React.useId();
  if (values.length < 2) return null;

  const width = 100;
  const height = 24;
  const max = Math.max(...values, 1);
  const step = width / (values.length - 1);

  const points = values.map((v, i) => {
    const x = i * step;
    const y = height - (v / max) * (height - 3) - 1.5;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });

  return (
    <svg
      aria-hidden
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className={cn("h-6 w-full", className)}
    >
      <defs>
        <linearGradient id={`spark-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.16} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <polygon
        points={`0,${height} ${points.join(" ")} ${width},${height}`}
        fill={`url(#spark-${id})`}
      />
      <polyline
        points={points.join(" ")}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

/**
 * Which direction of change is the good one. `inverse` means rising is bad —
 * flagged counts and exposure both work that way — and `neutral` means the
 * change is reported without a judgement attached.
 */
type DeltaIntent = "normal" | "inverse" | "neutral";

/**
 * Movement is coloured on one side only.
 *
 * The arrow already states the direction, so tinting both directions would buy
 * nothing and cost a great deal: a green rise beside a red fall is the classic
 * red/green pair that collapses under protanopia, and it would also put the
 * accent hue to work meaning "good" when in this console it means "live". So
 * the reading is one-sided — adverse movement earns the severity hue, and
 * everything else stays in muted ink where it cannot compete with the figure.
 */
function Delta({
  delta,
  intent,
  unit,
}: {
  delta: number;
  intent: DeltaIntent;
  unit: "percent" | "points";
}) {
  const rising = delta > 0.0005;
  const falling = delta < -0.0005;
  const flat = !rising && !falling;

  const adverse = intent === "neutral" ? false : intent === "inverse" ? rising : falling;

  const Icon = flat ? Minus : rising ? ArrowUpRight : ArrowDownRight;
  const magnitude = Math.abs(delta);
  const text =
    unit === "points"
      ? `${(magnitude * 100).toFixed(1)} pt`
      : `${(magnitude * 100).toFixed(magnitude < 0.1 ? 1 : 0)}%`;

  return (
    <span
      className={cn(
        "figures-tabular inline-flex items-center gap-0.5 text-subheadline font-medium",
        adverse ? "text-[var(--severity-high)]" : "text-muted-foreground"
      )}
    >
      <Icon className="size-3 shrink-0" aria-hidden />
      {flat ? "flat" : text}
    </span>
  );
}

export interface StatTileProps {
  label: string;
  /**
   * `null` when the figure genuinely cannot be computed — an empty buffer has no
   * concentration ratio, and a 0% reading there would be a claim rather than an
   * absence. That case prints `fallback` and animates nothing.
   */
  value: number | null;
  /** NumberFlow's own narrowed `Intl.NumberFormatOptions` — it cannot animate
   *  scientific or engineering notation, so its type excludes them. */
  format?: Format;
  /** Shown in place of the figure when `value` is `null`. */
  fallback?: string;
  prefix?: string;
  suffix?: string;
  caption?: React.ReactNode;
  delta?: number | null;
  deltaIntent?: DeltaIntent;
  deltaUnit?: "percent" | "points";
  deltaCaption?: string;
  spark?: number[];
  className?: string;
}

/**
 * One figure in a summary strip.
 *
 * It carries no surface of its own — no tile, no ring, no shadow, no tinted icon
 * chip. Four such chips would be four competing hues in the first 200px of the
 * page, which is the loudest possible opening and reads as decoration rather than
 * instrumentation. Separation comes from the strip's hairlines instead, so the
 * only ink here is the number and the words that qualify it.
 *
 * Every 4-up strip in the console is built from this one component — the KPI row
 * on the overview and the concentration figures on the accounts page — so the
 * type scale, the padding, the hover and the count-up cannot drift apart between
 * two strips that look identical.
 *
 * The hero figure uses proportional figures, not `tabular-nums`: nothing is
 * stacked beneath it to align with, and tabular spacing makes a large number
 * look gappy. Tabular is reserved for the table, the delta and the axis ticks.
 */
function StatTile({
  label,
  value,
  format,
  fallback = "No data",
  prefix,
  suffix,
  caption,
  delta,
  deltaIntent = "neutral",
  deltaUnit = "percent",
  deltaCaption = "vs. previous window",
  spark,
  className,
}: StatTileProps) {
  const reduced = usePrefersReducedMotion();

  return (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-2 px-4 py-3.5",
        // Colour only, no lift. These tiles are cells in a 1px-gap grid whose
        // background *is* the hairline between them, so translating one would
        // drag the seams around it.
        "transition-colors duration-200 ease-[var(--ease-out-quint)]",
        "hover:bg-card-hover",
        className
      )}
    >
      <p className="text-eyebrow">{label}</p>

      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <p className="font-heading text-large-title leading-none font-semibold">
          {value === null ? (
            <span className="text-muted-foreground">{fallback}</span>
          ) : (
            <NumberFlow
              value={value}
              locales="en-US"
              format={format}
              prefix={prefix}
              suffix={suffix}
              respectMotionPreference
              transformTiming={{
                duration: reduced ? 0 : 620,
                easing: "cubic-bezier(0.23, 1, 0.32, 1)",
              }}
            />
          )}
        </p>
        {delta !== null && delta !== undefined ? (
          <Delta delta={delta} intent={deltaIntent} unit={deltaUnit} />
        ) : null}
      </div>

      {spark && spark.length > 1 ? <Sparkline values={spark} /> : null}

      <p className="text-callout leading-snug text-muted-foreground">
        {caption ?? (delta !== null && delta !== undefined ? deltaCaption : " ")}
      </p>
    </div>
  );
}

export { StatTile, Sparkline };
