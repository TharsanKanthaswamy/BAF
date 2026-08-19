"use client";

import { EngineStatus } from "@/components/console/engine-status";
import { PageHeader, PageSections } from "@/components/console/page-header";
import { useConsole } from "@/components/console/console-provider";
import { BatchUpload } from "@/components/dashboard/batch-upload";

/**
 * Retrospective scoring.
 *
 * The same ensemble, the same buffer, a different arrival path: a settlement
 * export or a day's ledger goes through `POST /upload-csv` and lands in the queues
 * alongside the live stream. Which is exactly why it is not on a monitoring page —
 * an upload writes to the buffer everyone else is reviewing.
 */
export function BatchView() {
  const { uploadBatch } = useConsole();

  return (
    <PageSections>
      <PageHeader
        title="Batch scoring"
        description="Rows are scored on arrival and written to the retention buffer, so they appear in the queues and in every figure derived from them. Nothing is scored client-side."
      />

      <EngineStatus />

      <div className="max-w-3xl">
        <BatchUpload onUpload={uploadBatch} />
      </div>
    </PageSections>
  );
}
