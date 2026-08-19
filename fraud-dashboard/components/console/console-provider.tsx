"use client";

import * as React from "react";
import { toast } from "sonner";

import {
  BACKEND_URL,
  clearHistory,
  deleteTransactions,
  fetchHistory,
  predict,
  simulate,
  uploadCsv,
  type DeleteResult,
} from "@/lib/api";
import { DEFAULT_FILTERS, type FilterState } from "@/lib/analytics";
import { useConsoleSettings } from "@/lib/settings";
import type {
  PredictPayload,
  TransactionRecord,
  TransactionSource,
  UploadResult,
} from "@/lib/types";

/**
 * How many rows a heartbeat asks for.
 *
 * The console holds up to 10,000 rows, and re-fetching all of them every four
 * seconds would move roughly four megabytes per poll to discover a handful of
 * new records. So the buffer is hydrated once in full and then only its head is
 * polled: 250 rows is far more than four seconds of traffic can produce, which
 * makes a missed record impossible short of a genuine outage, and any outage
 * long enough to overrun the tail ends in a full re-hydrate anyway.
 */
const TAIL_LIMIT = 250;

export interface ConsoleState {
  /** Newest first, capped at the operator's row limit. */
  rows: TransactionRecord[];
  /** True until the first response settles, success or failure. */
  isInitialLoading: boolean;
  /** A request is in flight over an already-painted view. */
  isRefetching: boolean;
  isConnected: boolean;
  lastSyncedAt: number | null;
  backendUrl: string;
  /** Shared so a filter survives navigation between the queue pages. */
  filters: FilterState;
  setFilters: (next: FilterState) => void;
  /** Full re-hydrate of the buffer. */
  refresh: () => void;
  runSimulation: (count: number) => Promise<void>;
  scoreOne: (payload: PredictPayload) => Promise<TransactionRecord | null>;
  uploadBatch: (file: File) => Promise<UploadResult>;
  /** Drop named rows from the buffer. Irreversible — confirm before calling. */
  deleteRows: (transactionIds: string[]) => Promise<DeleteResult>;
  /** Drop every retained row of the given origins. Irreversible. */
  deleteBySource: (sources: TransactionSource[]) => Promise<DeleteResult>;
  resetEngine: () => Promise<void>;
}

const ConsoleContext = React.createContext<ConsoleState | null>(null);

/**
 * Merge a freshly polled head into the buffer.
 *
 * The engine answers newest-first, so every row the tail did not return is
 * strictly older than every row it did. That turns the merge into a concatenation
 * plus a de-duplicate, instead of re-sorting ten thousand rows four times a
 * minute.
 */
function mergeHead(
  previous: TransactionRecord[],
  head: TransactionRecord[],
  cap: number
): TransactionRecord[] {
  if (previous.length === 0) return head.slice(0, cap);

  const seen = new Set(head.map((row) => row.transaction_id));
  const merged = head.slice();
  for (const row of previous) {
    if (merged.length >= cap) break;
    if (!seen.has(row.transaction_id)) merged.push(row);
  }
  return merged.length > cap ? merged.slice(0, cap) : merged;
}

/**
 * Owns the connection to the scoring engine, hoisted to the console layout.
 *
 * Cache Components is not enabled in this project, so a page's own state is
 * discarded on every navigation. Anything that must survive a route change lives
 * here instead: the buffer, the poll loop, and the filter slice. That is what
 * lets an analyst filter the queue, open the accounts page, come back, and find
 * both the filter and the stream exactly where they were.
 */
export function ConsoleProvider({ children }: { children: React.ReactNode }) {
  const { rowLimit, pollMs } = useConsoleSettings();

  const [rows, setRows] = React.useState<TransactionRecord[]>([]);
  const [isInitialLoading, setIsInitialLoading] = React.useState(true);
  const [isRefetching, setIsRefetching] = React.useState(false);
  const [isConnected, setIsConnected] = React.useState(false);
  const [lastSyncedAt, setLastSyncedAt] = React.useState<number | null>(null);
  const [filters, setFilters] = React.useState<FilterState>(DEFAULT_FILTERS);

  const mounted = React.useRef(true);
  const controller = React.useRef<AbortController | null>(null);
  const connected = React.useRef(false);
  /** The first outcome is reported by the page's own empty state, not a toast. */
  const announced = React.useRef(false);
  /** Only the newest request may write state, so an aborted one cannot clobber it. */
  const seq = React.useRef(0);
  /** Set until a full window has landed, so a tail can never be the first fetch. */
  const needsHydrate = React.useRef(true);
  /** Read inside the loop so a settings change does not restart it needlessly. */
  const limitRef = React.useRef(rowLimit);
  limitRef.current = rowLimit;

  const load = React.useCallback(async (mode: "hydrate" | "tail") => {
    // Every caller takes over: the newest request cancels whatever is in flight,
    // and `seq` decides which one is still allowed to write state.
    const id = ++seq.current;
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    const cap = limitRef.current;
    const hydrating = mode === "hydrate" || needsHydrate.current;
    setIsRefetching(true);

    try {
      const incoming = await fetchHistory(
        hydrating ? cap : Math.min(TAIL_LIMIT, cap),
        abort.signal
      );
      if (seq.current !== id || !mounted.current) return;

      needsHydrate.current = false;
      setRows((previous) =>
        hydrating ? incoming.slice(0, cap) : mergeHead(previous, incoming, cap)
      );
      setLastSyncedAt(Date.now());

      if (!connected.current) {
        connected.current = true;
        setIsConnected(true);
        if (announced.current) {
          toast.success("Reconnected to the scoring engine", {
            description: "The stream is live again.",
          });
        }
      }
    } catch (error) {
      if (abort.signal.aborted || seq.current !== id || !mounted.current) return;

      // A failed poll means the buffer may have moved on without us, so the next
      // successful request has to be a full window rather than a tail.
      needsHydrate.current = true;

      if (connected.current) {
        connected.current = false;
        setIsConnected(false);
        // Only the transition is announced. Toasting every failed poll would fire
        // fifteen times a minute while the backend is down.
        toast.error("Lost contact with the scoring engine", {
          description:
            error instanceof Error
              ? error.message
              : `No response from ${BACKEND_URL}.`,
        });
      }
    } finally {
      if (seq.current === id) {
        announced.current = true;
        if (mounted.current) {
          setIsRefetching(false);
          setIsInitialLoading(false);
        }
      }
    }
  }, []);

  React.useEffect(() => {
    mounted.current = true;
    let timer: number | undefined;
    let stopped = false;

    // A self-scheduling loop rather than setInterval: the next request is only
    // queued once the previous one settles, so a slow engine cannot stack
    // overlapping polls. The first fetch runs through the same scheduler, which
    // keeps the effect body itself free of any state write.
    function schedule(delay: number) {
      if (stopped || timer !== undefined || document.hidden) return;
      timer = window.setTimeout(() => void tick(), delay);
    }

    async function tick() {
      timer = undefined;
      await load("tail");
      // A zero interval means the operator paused the heartbeat. Manual refresh
      // and every write action still work; nothing is scheduled behind them.
      if (pollMs > 0) schedule(pollMs);
    }

    function cancel() {
      if (timer !== undefined) {
        window.clearTimeout(timer);
        timer = undefined;
      }
    }

    // A background tab does not need a scoring engine poll every four seconds;
    // it gets one immediate catch-up fetch when it comes back to the front.
    const onVisibility = () => {
      if (document.hidden) cancel();
      else schedule(0);
    };

    schedule(0);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      stopped = true;
      mounted.current = false;
      cancel();
      document.removeEventListener("visibilitychange", onVisibility);
      controller.current?.abort();
    };
  }, [load, pollMs]);

  // Raising the row limit needs a wider window than the buffer currently holds,
  // and lowering it should free the excess immediately.
  React.useEffect(() => {
    needsHydrate.current = true;
  }, [rowLimit]);

  const refresh = React.useCallback(() => {
    void load("hydrate");
  }, [load]);

  const runSimulation = React.useCallback(
    async (count: number) => {
      await simulate(count);
      await load("hydrate");
    },
    [load]
  );

  const scoreOne = React.useCallback(
    async (payload: PredictPayload): Promise<TransactionRecord | null> => {
      const record = await predict(payload);
      await load("hydrate");
      return record;
    },
    [load]
  );

  const uploadBatch = React.useCallback(
    async (file: File): Promise<UploadResult> => {
      const result = await uploadCsv(file);
      await load("hydrate");
      return result;
    },
    [load]
  );

  const resetEngine = React.useCallback(async () => {
    setRows([]);
    await clearHistory();
    needsHydrate.current = true;
    await load("hydrate");
  }, [load]);

  /**
   * Remove rows, then re-hydrate.
   *
   * The buffer is pruned locally the moment the engine confirms, before the
   * re-hydrate lands. Without that the rows the operator just deleted stay on
   * screen for the length of a round trip, which reads as a failed delete and
   * invites a second click.
   */
  const deleteRows = React.useCallback(
    async (transactionIds: string[]): Promise<DeleteResult> => {
      const removed = new Set(transactionIds);
      setRows((previous) => previous.filter((row) => !removed.has(row.transaction_id)));
      const result = await deleteTransactions({ transactionIds });
      needsHydrate.current = true;
      await load("hydrate");
      return result;
    },
    [load]
  );

  const deleteBySource = React.useCallback(
    async (sources: TransactionSource[]): Promise<DeleteResult> => {
      const dropped = new Set<string>(sources);
      setRows((previous) =>
        previous.filter((row) => !dropped.has(row.source ?? "unknown"))
      );
      const result = await deleteTransactions({ sources });
      needsHydrate.current = true;
      await load("hydrate");
      return result;
    },
    [load]
  );

  const value = React.useMemo<ConsoleState>(
    () => ({
      rows,
      isInitialLoading,
      isRefetching,
      isConnected,
      lastSyncedAt,
      backendUrl: BACKEND_URL,
      filters,
      setFilters,
      refresh,
      runSimulation,
      scoreOne,
      uploadBatch,
      deleteRows,
      deleteBySource,
      resetEngine,
    }),
    [
      rows,
      isInitialLoading,
      isRefetching,
      isConnected,
      lastSyncedAt,
      filters,
      refresh,
      runSimulation,
      scoreOne,
      uploadBatch,
      deleteRows,
      deleteBySource,
      resetEngine,
    ]
  );

  return <ConsoleContext value={value}>{children}</ConsoleContext>;
}

export function useConsole(): ConsoleState {
  const value = React.useContext(ConsoleContext);
  if (!value) {
    throw new Error("useConsole must be called inside the console layout.");
  }
  return value;
}
