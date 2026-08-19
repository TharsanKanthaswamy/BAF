"use client";

import * as React from "react";

import {
  analyse,
  applyFilters,
  channelOptions,
  sortNewestFirst,
  type Analytics,
  type FilterState,
} from "@/lib/analytics";
import { useNow } from "@/lib/hooks";
import { field } from "@/lib/risk";
import type { TransactionRecord } from "@/lib/types";
import { useConsole, type ConsoleState } from "@/components/console/console-provider";

/** Newest record time in the slice: a deterministic clock for the first paint. */
function newestStamp(rows: TransactionRecord[]): number | null {
  let max = 0;
  for (const row of rows) {
    const raw = field.at(row);
    if (!raw) continue;
    const t = new Date(raw).getTime();
    if (Number.isFinite(t) && t > max) max = t;
  }
  return max || null;
}

export interface ConsoleData extends ConsoleState {
  /** The buffer with the shared filter applied. */
  filtered: TransactionRecord[];
  /** `filtered`, newest first. What every queue renders. */
  ordered: TransactionRecord[];
  analytics: Analytics;
  /** Channel values present in the buffer, for the filter control. */
  channels: string[];
  /** Wall clock, or the newest record before mount. Ticks every 4s. */
  clock: number;
  now: number | null;
  /** First fetch, nothing on screen yet. */
  awaiting: boolean;
  /** Figures on screen are real but the engine has since gone quiet. */
  stale: boolean;
}

/**
 * The one derivation every data page shares.
 *
 * Kept out of the provider on purpose: `analyse` is a full pass over the buffer,
 * and the four tool pages have no use for it. Pages that need figures call this;
 * pages that only need actions call `useConsole` directly and pay nothing.
 */
export function useConsoleData(): ConsoleData {
  const state = useConsole();
  const { rows, filters, isInitialLoading, isConnected } = state;

  const now = useNow(4_000);

  const filtered = React.useMemo(() => applyFilters(rows, filters), [rows, filters]);
  const ordered = React.useMemo(() => sortNewestFirst(filtered), [filtered]);
  const channels = React.useMemo(() => channelOptions(rows), [rows]);

  // `useNow` is null until mount; falling back to the newest record keeps the
  // first paint deterministic instead of reading the clock during render.
  const clock = now ?? newestStamp(filtered) ?? 0;

  const analytics = React.useMemo(() => analyse(filtered, clock), [filtered, clock]);

  return {
    ...state,
    filtered,
    ordered,
    channels,
    clock,
    now,
    analytics,
    awaiting: isInitialLoading && rows.length === 0,
    stale: !isConnected && rows.length > 0,
  };
}

export interface BufferCounts {
  rows: number;
  flagged: number;
  critical: number;
}

/**
 * The three figures the navigation badges need, in a single pass with no
 * allocation. The shell is mounted on every route, so it must not be the thing
 * that runs `analyse` over ten thousand rows.
 */
export function countBuffer(rows: TransactionRecord[]): BufferCounts {
  let flagged = 0;
  let critical = 0;
  for (const row of rows) {
    if (row.is_fraud) flagged += 1;
    const level = row.risk_level?.toUpperCase();
    if (level === "CRITICAL") critical += 1;
  }
  return { rows: rows.length, flagged, critical };
}
