"use client";

import { EngineStatus } from "@/components/console/engine-status";
import { PageHeader, PageSections } from "@/components/console/page-header";
import { useConsole } from "@/components/console/console-provider";
import { TriageSimulator } from "@/components/dashboard/triage-simulator";

/**
 * The bench.
 *
 * Two jobs that both mean "put something on the wire": score one instruction you
 * have typed out yourself, or inject a burst of synthetic traffic. Neither belongs
 * on a monitoring page — an analyst working a queue should not be one misclick
 * away from writing to the buffer they are reviewing.
 *
 * This page reads `useConsole` rather than `useConsoleData`: it needs the write
 * actions and none of the derived figures, and `analyse` is a full pass over ten
 * thousand rows that nothing here would look at.
 */
export function SimulatorView() {
  const { scoreOne, runSimulation } = useConsole();

  return (
    <PageSections>
      <PageHeader
        title="Simulator"
        description="Everything submitted here is scored by the live ensemble and written to the same buffer the queues read from, so a synthetic burst will show up on the overview seconds later."
      />

      <EngineStatus />

      <div className="max-w-5xl">
        <TriageSimulator onPredict={scoreOne} onSimulate={runSimulation} />
      </div>
    </PageSections>
  );
}
