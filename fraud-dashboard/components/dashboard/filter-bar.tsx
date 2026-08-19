"use client";

import { ListFilter, Search, Sparkles, X } from "lucide-react";

import type { FilterState } from "@/lib/analytics";
import { DEFAULT_FILTERS } from "@/lib/analytics";
import { formatInteger } from "@/lib/format";
import { RISK_STYLES } from "@/lib/risk";
import {
  RISK_LEVELS,
  SOURCE_LABEL,
  SYNTHETIC_SOURCES,
  TRANSACTION_SOURCES,
  type TransactionSource,
} from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const RISK_LABEL: Record<string, string> = {
  ALL: "All risk tiers",
  ...Object.fromEntries(
    RISK_LEVELS.map((level) => [level, RISK_STYLES[level].label])
  ),
};

const VERDICT_LABEL: Record<string, string> = {
  ALL: "Any verdict",
  FLAGGED: "Flagged only",
  CLEARED: "Cleared only",
};

/**
 * Origin labels, including the two pseudo-values.
 *
 * `SYNTHETIC` is the union of the generated origins rather than a multi-select,
 * because "everything the engine made up" is the one combination anybody asks
 * for — it is the selection an operator makes before clearing the buffer to work
 * their own data.
 */
const SOURCE_FILTER_LABEL: Record<string, string> = {
  ALL: "Any origin",
  SYNTHETIC: "Synthetic only",
  ...Object.fromEntries(
    TRANSACTION_SOURCES.map((source) => [source, SOURCE_LABEL[source]])
  ),
};

/**
 * One filter row, above everything it scopes. The tiles, both charts and the
 * table all read the same filtered slice — a per-chart filter would let two
 * panels describe different populations while sitting side by side.
 *
 * `Select.Value` renders the raw value unless it is told otherwise, so each
 * control passes a render function that maps the value back to its label.
 */
export function FilterBar({
  filters,
  onChange,
  channels,
  counts,
  shown,
  total,
  className,
}: {
  filters: FilterState;
  onChange: (next: FilterState) => void;
  channels: string[];
  /**
   * Retained rows by origin. Supplied where the origin filter is worth counting;
   * omitted elsewhere, in which case the menu lists origins without figures.
   */
  counts?: Record<TransactionSource, number>;
  shown: number;
  total: number;
  className?: string;
}) {
  const dirty =
    filters.query !== "" ||
    filters.risk !== "ALL" ||
    filters.channel !== "ALL" ||
    filters.verdict !== "ALL" ||
    filters.source !== "ALL";

  const syntheticCount = counts
    ? SYNTHETIC_SOURCES.reduce((sum, source) => sum + counts[source], 0)
    : null;

  const tally = (value: number | null) =>
    value === null ? null : (
      <span className="figures-tabular ml-auto pl-3 text-callout text-muted-foreground">
        {formatInteger(value)}
      </span>
    );

  const set = <K extends keyof FilterState>(key: K, value: FilterState[K]) =>
    onChange({ ...filters, [key]: value });

  return (
    <div
      className={cn(
        // A glass toolbar, because this row is chrome: it holds controls, not
        // data. The rule the whole interface follows is that glass means "this
        // acts on the content" and opaque means "this *is* the content" — which
        // is also why every chart surface below stays solid.
        "material-floating flex flex-wrap items-center gap-2 rounded-2xl p-2.5",
        "[--glass-blur:22px] [--glass-shadow:var(--shadow-tile)]",
        className
      )}
    >
      <div className="relative min-w-0 flex-1 basis-56">
        <Search
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          type="search"
          value={filters.query}
          onChange={(e) => set("query", e.target.value)}
          placeholder="Search transaction, account, channel…"
          aria-label="Search the stream"
          className="pr-8 pl-8"
        />
        {filters.query ? (
          <button
            type="button"
            onClick={() => set("query", "")}
            aria-label="Clear search"
            className={cn(
              "pressable absolute top-1/2 right-1.5 grid size-6 -translate-y-1/2 place-items-center rounded-md",
              "text-muted-foreground outline-none",
              "transition-colors duration-150 ease-[var(--ease-out-quint)]",
              "hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            )}
          >
            <X className="size-3.5" />
          </button>
        ) : null}
      </div>

      <Select
        value={filters.risk}
        onValueChange={(value) => set("risk", (value ?? "ALL") as FilterState["risk"])}
      >
        <SelectTrigger aria-label="Filter by risk tier" className="w-[10.5rem]">
          <SelectValue>
            {(value: string | null) => RISK_LABEL[value ?? "ALL"] ?? "All risk tiers"}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="ALL">
            <ListFilter aria-hidden className="size-3.5 text-muted-foreground" />
            All risk tiers
          </SelectItem>
          {RISK_LEVELS.map((level) => {
            const style = RISK_STYLES[level];
            return (
              <SelectItem key={level} value={level}>
                <style.Icon aria-hidden className={cn("size-3.5", style.fg)} />
                {style.label}
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>

      <Select
        value={filters.verdict}
        onValueChange={(value) =>
          set("verdict", (value ?? "ALL") as FilterState["verdict"])
        }
      >
        <SelectTrigger aria-label="Filter by verdict" className="w-[9.5rem]">
          <SelectValue>
            {(value: string | null) => VERDICT_LABEL[value ?? "ALL"] ?? "Any verdict"}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {Object.entries(VERDICT_LABEL).map(([value, label]) => (
            <SelectItem key={value} value={value}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={filters.channel}
        onValueChange={(value) => set("channel", value ?? "ALL")}
      >
        <SelectTrigger aria-label="Filter by channel" className="w-[9.5rem]">
          <SelectValue>
            {(value: string | null) =>
              !value || value === "ALL" ? "All channels" : value
            }
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="ALL">All channels</SelectItem>
          {channels.map((channel) => (
            <SelectItem key={channel} value={channel}>
              {channel}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={filters.source}
        onValueChange={(value) =>
          set("source", (value ?? "ALL") as FilterState["source"])
        }
      >
        <SelectTrigger aria-label="Filter by origin" className="w-[10.5rem]">
          <SelectValue>
            {(value: string | null) =>
              SOURCE_FILTER_LABEL[value ?? "ALL"] ?? "Any origin"
            }
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="ALL">
            <ListFilter aria-hidden className="size-3.5 text-muted-foreground" />
            Any origin
            {tally(counts ? total : null)}
          </SelectItem>
          <SelectItem value="SYNTHETIC">
            <Sparkles aria-hidden className="size-3.5 text-muted-foreground" />
            Synthetic only
            {tally(syntheticCount)}
          </SelectItem>
          {TRANSACTION_SOURCES.map((source) => (
            <SelectItem key={source} value={source}>
              {SOURCE_LABEL[source]}
              {tally(counts ? counts[source] : null)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="ml-auto flex items-center gap-2 pr-1 pl-2">
        <p className="figures-tabular text-callout text-muted-foreground">
          <span className="font-medium text-foreground">{formatInteger(shown)}</span>
          {" of "}
          {formatInteger(total)}
        </p>
        {dirty ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onChange(DEFAULT_FILTERS)}
          >
            Reset
          </Button>
        ) : null}
      </div>
    </div>
  );
}
