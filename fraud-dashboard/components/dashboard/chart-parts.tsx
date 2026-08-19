"use client";

import * as React from "react";
import { ChartColumnBig, Table2 } from "lucide-react";

import { cn } from "@/lib/utils";

export interface SeriesSpec {
  key: string;
  label: string;
  /** CSS custom property holding the hue, e.g. `var(--chart-1)`. */
  color: string;
}

/**
 * A legend is present whenever there are two or more series — identity must
 * never be carried by colour alone. A single-series chart gets none: its title
 * already names the series.
 */
function ChartLegend({
  series,
  className,
}: {
  series: SeriesSpec[];
  className?: string;
}) {
  if (series.length < 2) return null;

  return (
    <ul
      className={cn("flex flex-wrap items-center gap-x-4 gap-y-1.5", className)}
    >
      {series.map((s) => (
        <li
          key={s.key}
          className="flex items-center gap-1.5 text-callout text-muted-foreground"
        >
          <span
            aria-hidden
            className="size-2 shrink-0 rounded-full"
            style={{ background: s.color }}
          />
          {s.label}
        </li>
      ))}
    </ul>
  );
}

/** The shared readout shell for every chart tooltip on the page. */
function ChartTooltipCard({
  title,
  children,
  className,
}: {
  title: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        // `rounded-2xl` is the step every piece of transient floating chrome in
        // this app shares — the select menu, the toast, and this tooltip. The
        // 20px overlay step is reserved for the page-blocking dialog, which is
        // large enough to carry it; at 150px wide this would read as a lozenge.
        "figures-tabular pointer-events-none min-w-[9.5rem] rounded-2xl bg-popover p-2.5",
        "text-popover-foreground ring-1 ring-border shadow-[var(--shadow-overlay)]",
        className
      )}
    >
      <p className="mb-1.5 text-subheadline font-medium text-muted-foreground">
        {title}
      </p>
      <dl className="space-y-1">{children}</dl>
    </div>
  );
}

function ChartTooltipRow({
  color,
  label,
  value,
}: {
  color?: string;
  label: React.ReactNode;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 text-callout">
      {color ? (
        <span
          aria-hidden
          className="size-2 shrink-0 rounded-full"
          style={{ background: color }}
        />
      ) : null}
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="ml-auto font-medium">{value}</dd>
    </div>
  );
}

const VIEWS = [
  { value: "chart", label: "Chart view", Icon: ChartColumnBig },
  { value: "table", label: "Table view", Icon: Table2 },
] as const;

export type ChartView = (typeof VIEWS)[number]["value"];

/**
 * Every chart ships a table twin. It is the accessibility fallback, the answer
 * to a contrast warning on a low-chroma series, and the only place exact figures
 * live — so it is a first-class view, not a hidden `<table>` for screen readers.
 */
function ViewToggle({
  value,
  onChange,
  className,
}: {
  value: ChartView;
  onChange: (next: ChartView) => void;
  className?: string;
}) {
  const activeIndex = VIEWS.findIndex((v) => v.value === value);

  return (
    <div
      role="radiogroup"
      aria-label="Chart or table"
      className={cn(
        "relative inline-flex h-7 items-center rounded-lg bg-muted p-0.5 ring-1 ring-inset ring-border",
        className
      )}
    >
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute top-0.5 left-0.5 size-6 rounded-md bg-card",
          "ring-1 ring-border shadow-[var(--shadow-tile)]",
          "transition-transform duration-[240ms] ease-[var(--ease-out-quint)]"
        )}
        style={{ transform: `translateX(${activeIndex * 1.5}rem)` }}
      />
      {VIEWS.map(({ value: v, label, Icon }) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={value === v}
          aria-label={label}
          title={label}
          onClick={() => onChange(v)}
          className={cn(
            "relative z-10 grid size-6 place-items-center rounded-md outline-none",
            "transition-colors duration-150 ease-[var(--ease-out-quint)]",
            "focus-visible:ring-2 focus-visible:ring-ring",
            value === v
              ? "text-foreground"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <Icon className="size-3.5" />
        </button>
      ))}
    </div>
  );
}

/** Shared axis/grid parameters — recessive by construction. */
const AXIS = {
  tick: { fill: "var(--ink-muted)", fontSize: 11 },
  line: "var(--axis)",
  grid: "var(--gridline)",
} as const;

export { ChartLegend, ChartTooltipCard, ChartTooltipRow, ViewToggle, AXIS };
