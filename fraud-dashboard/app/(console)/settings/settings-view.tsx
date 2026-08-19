"use client";

import * as React from "react";
import { RotateCcw, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { EngineStatus } from "@/components/console/engine-status";
import { PageHeader, PageSections } from "@/components/console/page-header";
import { useConsole } from "@/components/console/console-provider";
import { Panel, PanelBody, PanelHeader } from "@/components/dashboard/panel";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPopup,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { formatInteger, formatRelative } from "@/lib/format";
import {
  PAGE_SIZE_CHOICES,
  POLL_CHOICES,
  ROW_LIMIT_CHOICES,
  describePoll,
  resetSettings,
  updateSettings,
  useConsoleSettings,
} from "@/lib/settings";
import { useNow } from "@/lib/hooks";
import { SYNTHETIC_SOURCES } from "@/lib/types";

/**
 * Operator preferences.
 *
 * Everything here is client-side and per-browser: it changes what this analyst
 * sees, never what the engine scores. The one exception is the last panel, which
 * writes to the shared buffer, so it is fenced off under its own heading and
 * behind a confirmation.
 */
export function SettingsView() {
  const settings = useConsoleSettings();
  const {
    backendUrl,
    isConnected,
    lastSyncedAt,
    refresh,
    resetEngine,
    rows,
    deleteBySource,
  } = useConsole();
  const now = useNow(10_000);
  const [clearing, setClearing] = React.useState(false);
  const [pruning, setPruning] = React.useState(false);

  const syncedIso = lastSyncedAt ? new Date(lastSyncedAt).toISOString() : null;

  // Counted from the buffer this browser holds, so the figure is honest about
  // being an estimate of what the server will delete rather than a promise.
  const syntheticHere = rows.reduce(
    (sum, row) => sum + ((SYNTHETIC_SOURCES as readonly (string | undefined)[]).includes(row.source) ? 1 : 0),
    0
  );

  const clear = async () => {
    setClearing(true);
    try {
      await resetEngine();
    } finally {
      setClearing(false);
    }
  };

  const prune = async () => {
    setPruning(true);
    try {
      const result = await deleteBySource([...SYNTHETIC_SOURCES]);
      toast.success(
        `Deleted ${formatInteger(result.deleted)} generated row${result.deleted === 1 ? "" : "s"}`,
        {
          description: `${formatInteger(result.remaining)} row${result.remaining === 1 ? "" : "s"} left in the buffer.`,
        }
      );
    } catch (error) {
      toast.error("Delete failed", {
        description:
          error instanceof Error
            ? error.message
            : "The engine did not confirm the deletion. Nothing was removed.",
      });
    } finally {
      setPruning(false);
    }
  };

  return (
    <PageSections>
      <PageHeader
        title="Settings"
        description="Buffer size, heartbeat interval and table density are stored in this browser and apply to every page of the console. They do not change how anything is scored."
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              resetSettings();
              toast.success("Preferences restored to defaults");
            }}
          >
            <RotateCcw className="size-3.5" />
            Restore defaults
          </Button>
        }
      />

      <EngineStatus />

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel>
          <PanelHeader
            eyebrow="Stream"
            title="How much history, how often"
            description="A larger buffer makes the charts and rollups cover more ground and costs one bigger fetch on load. The heartbeat only ever asks for the head of the stream, so shortening it is cheap."
          />
          <PanelBody className="space-y-5">
            <Choice
              name="rowLimit"
              label="Buffer size"
              hint="Rows held in memory. Every figure on every page is computed from exactly this set."
              value={settings.rowLimit}
              options={ROW_LIMIT_CHOICES.map((rows) => ({
                value: rows,
                label: formatInteger(rows),
              }))}
              onChange={(rowLimit) => updateSettings({ rowLimit })}
            />
            <Choice
              name="pollMs"
              label="Heartbeat"
              hint="Paused automatically while this tab is in the background, whatever the interval."
              value={settings.pollMs}
              options={POLL_CHOICES.map((pollMs) => ({
                value: pollMs,
                label: describePoll(pollMs),
              }))}
              onChange={(pollMs) => updateSettings({ pollMs })}
            />
          </PanelBody>
        </Panel>

        <Panel>
          <PanelHeader
            eyebrow="Tables"
            title="Rows on screen"
            description="Sorting always runs over the whole buffer; these settings only change how much of the result is painted at once."
          />
          <PanelBody className="space-y-5">
            <Choice
              name="pageSize"
              label="Rows per page"
              hint="Larger pages mean fewer clicks and more DOM. 50 is comfortable on a laptop."
              value={settings.pageSize}
              options={PAGE_SIZE_CHOICES.map((size) => ({
                value: size,
                label: formatInteger(size),
              }))}
              onChange={(pageSize) => updateSettings({ pageSize })}
            />
            <Choice
              name="density"
              label="Row height"
              hint="Compact fits roughly a third more rows in the same space."
              value={settings.density}
              options={[
                { value: "comfortable", label: "Comfortable" },
                { value: "compact", label: "Compact" },
              ]}
              onChange={(density) => updateSettings({ density })}
            />
          </PanelBody>
        </Panel>

        <Panel>
          <PanelHeader
            eyebrow="Connection"
            title="Scoring engine"
            description="Read-only. The address is baked in at build time from NEXT_PUBLIC_BACKEND_URL."
          />
          <PanelBody>
            <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-[10rem_1fr]">
              <Fact label="Endpoint">
                <span className="font-mono text-callout break-all">{backendUrl}</span>
              </Fact>
              <Fact label="State">{isConnected ? "Answering" : "Not answering"}</Fact>
              <Fact label="Last response">
                {syncedIso
                  ? formatRelative(syncedIso, now ?? Date.parse(syncedIso))
                  : "No response yet"}
              </Fact>
            </dl>
            <Button variant="outline" size="sm" className="mt-4" onClick={refresh}>
              Re-hydrate the buffer
            </Button>
          </PanelBody>
        </Panel>

        <Panel>
          <PanelHeader
            eyebrow="Shared state"
            title="Clear the engine buffer"
            description="Neither of these is a preference. They delete scored history on the server, for everyone looking at this console, and cannot be undone."
          />
          <PanelBody className="flex flex-wrap gap-2">
            <Dialog>
              <DialogTrigger
                render={
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={pruning || syntheticHere === 0}
                  >
                    <Sparkles className="size-3.5" />
                    Delete generated rows
                    {syntheticHere > 0 ? ` (${formatInteger(syntheticHere)})` : ""}
                  </Button>
                }
              />
              <DialogPopup className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Delete every generated row?</DialogTitle>
                  <DialogDescription>
                    This removes the rows the engine produced itself: the sample
                    ledger it seeded at startup and everything the load generator
                    has injected since.
                  </DialogDescription>
                </DialogHeader>
                <DialogBody>
                  <p className="text-body text-muted-foreground">
                    Rows you uploaded or scored by hand are kept. So are rows
                    retained before the engine started recording origin: it
                    cannot prove those are synthetic, so it will not guess. Delete
                    those from the transactions table instead, where you can see
                    exactly what goes.
                  </p>
                  <p className="mt-2 text-callout text-muted-foreground">
                    {formatInteger(syntheticHere)} generated row
                    {syntheticHere === 1 ? " is" : "s are"} in this browser&apos;s
                    buffer. The engine retains more history than the console
                    fetches, so the true number removed may be higher. The toast
                    afterwards reports what the engine actually deleted.
                  </p>
                </DialogBody>
                <DialogFooter>
                  <DialogClose
                    render={<Button variant="outline" size="sm">Keep them</Button>}
                  />
                  <DialogClose
                    render={
                      <Button variant="danger" size="sm" onClick={prune}>
                        Delete generated rows
                      </Button>
                    }
                  />
                </DialogFooter>
              </DialogPopup>
            </Dialog>

            <Dialog>
              <DialogTrigger
                render={
                  <Button variant="destructive" size="sm" disabled={clearing}>
                    <Trash2 className="size-3.5" />
                    Clear history
                  </Button>
                }
              />
              <DialogPopup>
                <DialogHeader>
                  <DialogTitle>Clear the scored history?</DialogTitle>
                  <DialogDescription>
                    Every row the engine has retained is deleted. Anyone else with this
                    console open loses the same history on their next heartbeat.
                  </DialogDescription>
                </DialogHeader>
                <DialogBody>
                  <p className="text-body text-muted-foreground">
                    New traffic is scored and retained as normal afterwards. Nothing about
                    the models or their thresholds changes.
                  </p>
                </DialogBody>
                <DialogFooter>
                  <DialogClose render={<Button variant="outline" size="sm">Keep it</Button>} />
                  <DialogClose
                    render={
                      <Button variant="danger" size="sm" onClick={clear}>
                        Clear history
                      </Button>
                    }
                  />
                </DialogFooter>
              </DialogPopup>
            </Dialog>
          </PanelBody>
        </Panel>
      </div>
    </PageSections>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="text-callout text-muted-foreground">{label}</dt>
      <dd className="text-body">{children}</dd>
    </>
  );
}

/**
 * A segmented control built on real radio inputs.
 *
 * The visible segments are `<span>` siblings styled off `peer-checked:`, so the
 * browser supplies roving-tabindex arrow-key navigation, the group label, and the
 * checked state for free. A div-with-role reimplementation of this gets all three
 * subtly wrong.
 */
function Choice<T extends string | number>({
  name,
  label,
  hint,
  value,
  options,
  onChange,
}: {
  name: string;
  label: string;
  hint?: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <fieldset className="min-w-0">
      <legend className="text-headline">{label}</legend>
      {hint ? (
        <p className="mt-1 max-w-prose text-callout leading-relaxed text-muted-foreground">
          {hint}
        </p>
      ) : null}
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {options.map((option) => (
          <label key={String(option.value)} className="cursor-pointer">
            <input
              type="radio"
              name={name}
              className="peer sr-only"
              checked={option.value === value}
              onChange={() => onChange(option.value)}
            />
            <span className="pressable figures-tabular inline-flex items-center rounded-lg bg-muted px-3 py-1.5 text-callout font-medium text-muted-foreground peer-checked:bg-foreground peer-checked:text-background peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--ring)]">
              {option.label}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
