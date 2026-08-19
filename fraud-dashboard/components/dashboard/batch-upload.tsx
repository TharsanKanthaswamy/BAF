"use client";

import * as React from "react";
import {
  CircleAlert,
  CircleCheck,
  FileSpreadsheet,
  LoaderCircle,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";

import { formatInteger } from "@/lib/format";
import type { UploadResult } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Panel, PanelBody, PanelFooter, PanelHeader } from "@/components/dashboard/panel";

const EXPECTED_COLUMNS = [
  "TransactionID",
  "AccountID",
  "TransactionAmount",
  "AccountBalance",
  "LoginAttempts",
  "TransactionDuration",
  "TransactionType",
  "Channel",
  "CustomerOccupation",
];

const MAX_BYTES = 25 * 1024 * 1024;

type Phase = "idle" | "uploading" | "done" | "error";

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

/** Reads whichever count key the engine happens to return. */
function summarise(result: UploadResult): { label: string; value: string }[] {
  const rows = result.rows ?? result.processed;
  const out: { label: string; value: string }[] = [];
  if (typeof rows === "number") {
    out.push({ label: "Rows scored", value: formatInteger(rows) });
  }
  if (typeof result.flagged === "number") {
    out.push({ label: "Flagged", value: formatInteger(result.flagged) });
  }
  return out;
}

/**
 * Batch scoring. The dropzone is a real `<label>` over a real file input, so it
 * is reachable by keyboard and announces itself — the previous build's `<div>`
 * with an onClick was mouse-only.
 */
export function BatchUpload({
  onUpload,
  className,
}: {
  onUpload: (file: File) => Promise<UploadResult>;
  className?: string;
}) {
  const [phase, setPhase] = React.useState<Phase>("idle");
  const [dragging, setDragging] = React.useState(false);
  const [file, setFile] = React.useState<File | null>(null);
  const [result, setResult] = React.useState<UploadResult | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  // Nested dragenter/dragleave pairs fire per child element; counting them is
  // what stops the highlight flickering as the cursor crosses the inner text.
  const depth = React.useRef(0);

  const reset = () => {
    setPhase("idle");
    setFile(null);
    setResult(null);
    setError(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  const send = async (candidate: File) => {
    if (!/\.csv$/i.test(candidate.name)) {
      setPhase("error");
      setFile(candidate);
      setError("That is not a CSV. Export the sheet as comma-separated values first.");
      toast.error("Unsupported file type", { description: candidate.name });
      return;
    }
    if (candidate.size > MAX_BYTES) {
      setPhase("error");
      setFile(candidate);
      setError(`The file is ${formatBytes(candidate.size)}. Split it into chunks under 25 MB.`);
      toast.error("File too large", { description: candidate.name });
      return;
    }

    setFile(candidate);
    setResult(null);
    setError(null);
    setPhase("uploading");

    try {
      const outcome = await onUpload(candidate);
      setResult(outcome);
      setPhase("done");
      const rows = outcome.rows ?? outcome.processed;
      toast.success("Batch scored", {
        description:
          typeof rows === "number"
            ? `${formatInteger(rows)} rows from ${candidate.name} joined the stream.`
            : outcome.message || `${candidate.name} was accepted.`,
      });
    } catch (cause) {
      const message =
        cause instanceof Error ? cause.message : "The engine rejected the upload.";
      setPhase("error");
      setError(message);
      toast.error("Batch scoring failed", { description: message });
    }
  };

  const busy = phase === "uploading";

  return (
    <div className={cn("grid gap-3 lg:grid-cols-[minmax(0,1fr)_20rem]", className)}>
      <Panel>
        <PanelHeader
          eyebrow="Batch"
          title="Score a CSV export"
          description="Every row runs the full ensemble: autoencoder, isolation forest, rules, then narration. Results land in the same stream as live traffic."
          actions={
            phase !== "idle" && !busy ? (
              <Button variant="ghost" size="sm" onClick={reset}>
                <Trash2 data-icon="inline-start" />
                Clear
              </Button>
            ) : undefined
          }
        />

        <PanelBody className="space-y-3">
          <label
            onDragEnter={(e) => {
              e.preventDefault();
              depth.current += 1;
              if (!busy) setDragging(true);
            }}
            onDragOver={(e) => e.preventDefault()}
            onDragLeave={(e) => {
              e.preventDefault();
              depth.current = Math.max(0, depth.current - 1);
              if (depth.current === 0) setDragging(false);
            }}
            onDrop={(e) => {
              e.preventDefault();
              depth.current = 0;
              setDragging(false);
              if (busy) return;
              const dropped = e.dataTransfer.files?.[0];
              if (dropped) void send(dropped);
            }}
            className={cn(
              "relative grid min-h-[11rem] cursor-pointer place-items-center rounded-2xl px-6 py-8 text-center",
              "ring-1 ring-inset outline-none",
              "transition-[background-color,box-shadow] duration-200 ease-[var(--ease-out-quint)]",
              "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
              busy && "cursor-progress",
              dragging
                ? "bg-[color-mix(in_oklab,var(--chart-1)_9%,var(--card))] ring-[color-mix(in_oklab,var(--chart-1)_45%,transparent)]"
                : "bg-inset ring-border hover:bg-inset-hover"
            )}
          >
            <input
              ref={inputRef}
              type="file"
              accept=".csv,text/csv"
              className="sr-only"
              disabled={busy}
              onChange={(e) => {
                const picked = e.target.files?.[0];
                if (picked) void send(picked);
              }}
            />

            <div className="space-y-2">
              <div
                aria-hidden
                className={cn(
                  "mx-auto grid size-11 place-items-center rounded-xl",
                  "bg-[color-mix(in_oklab,var(--chart-1)_12%,var(--card))]"
                )}
                style={{
                  boxShadow:
                    "inset 0 0 0 1px color-mix(in oklab, var(--chart-1) 24%, transparent)",
                }}
              >
                {busy ? (
                  <LoaderCircle className="size-5 animate-spin text-[var(--chart-1)] motion-reduce:animate-none" />
                ) : (
                  <Upload className="size-5 text-[var(--chart-1)]" />
                )}
              </div>

              <p className="text-body font-medium">
                {busy
                  ? `Scoring ${file?.name ?? "the batch"}…`
                  : dragging
                    ? "Release to score"
                    : "Drop a CSV here, or click to browse"}
              </p>
              <p className="mx-auto max-w-sm text-callout leading-relaxed text-muted-foreground">
                {busy
                  ? "Narration is generated per flagged row, so a large file takes a moment."
                  : "Up to 25 MB. The header row decides the mapping, so spelling matters more than order."}
              </p>
            </div>
          </label>

          {phase === "done" && result ? (
            <div className="notice rounded-xl p-3.5 [--notice:var(--brand)]">
              <div className="flex items-center gap-2">
                <CircleCheck
                  aria-hidden
                  className="size-4 shrink-0 text-[var(--brand)]"
                />
                <p className="text-body font-medium">
                  {file?.name} scored
                </p>
                {file ? (
                  <Badge variant="neutral" size="sm" className="ml-auto">
                    {formatBytes(file.size)}
                  </Badge>
                ) : null}
              </div>

              {summarise(result).length > 0 ? (
                <dl className="figures-tabular mt-2.5 flex flex-wrap gap-x-6 gap-y-1.5">
                  {summarise(result).map((entry) => (
                    <div key={entry.label} className="flex items-baseline gap-1.5">
                      <dt className="text-subheadline text-[var(--ink-muted)]">
                        {entry.label}
                      </dt>
                      <dd className="text-body font-semibold">{entry.value}</dd>
                    </div>
                  ))}
                </dl>
              ) : null}

              {result.message ? (
                <p className="mt-2 text-callout leading-relaxed text-muted-foreground">
                  {result.message}
                </p>
              ) : null}
            </div>
          ) : null}

          {phase === "error" && error ? (
            <div
              role="alert"
              className="notice rounded-xl p-3.5 [--notice:var(--severity-critical)]"
            >
              <div className="flex items-start gap-2">
                <CircleAlert
                  aria-hidden
                  className="mt-px size-4 shrink-0 text-[var(--severity-critical)]"
                />
                <div className="min-w-0 space-y-1">
                  <p className="text-body font-medium">
                    {file ? `${file.name} was not scored` : "Upload rejected"}
                  </p>
                  <p className="text-callout leading-relaxed break-words text-muted-foreground">
                    {error}
                  </p>
                </div>
              </div>
            </div>
          ) : null}
        </PanelBody>

        <PanelFooter>
          <span>
            Rows are appended, never replaced. Reset the engine to clear history.
          </span>
        </PanelFooter>
      </Panel>

      <Panel>
        <PanelHeader
          eyebrow="Schema"
          title="Columns the parser reads"
          description="Anything else in the file is ignored. Missing numeric columns fall back to the same defaults the live feed uses."
        />
        <PanelBody>
          <ul className="space-y-1">
            {EXPECTED_COLUMNS.map((column) => (
              <li
                key={column}
                className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-callout odd:bg-inset"
              >
                <FileSpreadsheet
                  aria-hidden
                  className="size-3 shrink-0 text-[var(--ink-muted)]"
                />
                <code className="font-mono text-subheadline">{column}</code>
              </li>
            ))}
          </ul>
        </PanelBody>
      </Panel>
    </div>
  );
}
