"use client";

import { RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useConsole } from "@/components/console/console-provider";
import { StatusStrip } from "@/components/console/status-strip";

/**
 * What the console is willing to claim about its own data, stated before any
 * figures are shown.
 *
 * Every page that prints a number renders this first. An operator acting on a
 * stale buffer at 3am is the failure mode this whole application exists to avoid,
 * so the disclosure is a shared component rather than a per-page decision that
 * one page can quietly forget to make.
 */
export function EngineStatus() {
  const { isConnected, isInitialLoading, rows, backendUrl, refresh } = useConsole();

  const retry = (
    <Button variant="outline" size="sm" onClick={refresh}>
      <RefreshCw data-icon="inline-start" />
      Retry now
    </Button>
  );

  if (isInitialLoading && rows.length === 0) {
    return (
      <StatusStrip
        tone="neutral"
        title="Connecting to the scoring engine"
        detail={`Waiting on the first snapshot from ${backendUrl}.`}
      />
    );
  }

  if (!isConnected && rows.length === 0) {
    return (
      <StatusStrip
        tone="critical"
        title="No scored traffic and no engine"
        detail={`Nothing answered at ${backendUrl}. Start the scoring service, then retry. The simulator and batch scoring need it too.`}
        action={retry}
      />
    );
  }

  if (!isConnected) {
    return (
      <StatusStrip
        tone="critical"
        title="The scoring engine is unreachable"
        detail={`Every figure on this page is the last snapshot received from ${backendUrl}, not live traffic.`}
        action={retry}
      />
    );
  }

  return null;
}
