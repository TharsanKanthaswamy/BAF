"use client";

import * as React from "react";
import { AnimatePresence, motion } from "motion/react";
import { Trash2, X } from "lucide-react";

import { formatInteger } from "@/lib/format";
import {
  SOURCE_LABEL,
  SYNTHETIC_SOURCES,
  TRANSACTION_SOURCES,
  type TransactionSource,
} from "@/lib/types";
import { cn } from "@/lib/utils";
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

/**
 * The bulk action bar for a table selection.
 *
 * Fixed to the bottom edge rather than pinned above the table, because a
 * selection is usually assembled while reading row four hundred and the action
 * has to stay reachable from there. It only exists while something is selected,
 * so it costs nothing the rest of the time.
 */
export function SelectionBar({
  count,
  breakdown,
  onClear,
  onDelete,
  className,
}: {
  count: number;
  /** Selected rows by origin. Drives the warning about non-generated rows. */
  breakdown: Record<TransactionSource, number>;
  onClear: () => void;
  onDelete: () => Promise<void>;
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  // Anything not seeded and not simulated is the operator's own data. Deleting
  // it is legitimate — that is what a selection is for — but it is worth saying
  // out loud, because "delete the synthetic rows" is the reason this control
  // exists and a stray tick is easy.
  const ownData = TRANSACTION_SOURCES.filter(
    (source) => !SYNTHETIC_SOURCES.includes(source) && breakdown[source] > 0
  );
  const ownCount = ownData.reduce((sum, source) => sum + breakdown[source], 0);

  const present = TRANSACTION_SOURCES.filter((source) => breakdown[source] > 0);

  const confirm = async () => {
    setBusy(true);
    try {
      await onDelete();
      setOpen(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AnimatePresence>
      {count > 0 ? (
        <motion.div
          // Opts out of the page's arrival cascade. This bar mounts when a row is
          // ticked, long after the page has settled, and it owns its own
          // entrance below — a CSS animation from an ancestor would outrank these
          // inline styles and run instead of them.
          data-overlay=""
          // Transform and opacity only. A bar that animated its height would
          // reflow the page it is floating over on every frame.
          initial={{ opacity: 0, transform: "translateY(12px)" }}
          animate={{ opacity: 1, transform: "translateY(0px)" }}
          exit={{ opacity: 0, transform: "translateY(12px)" }}
          transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
          className={cn(
            "pointer-events-none fixed inset-x-0 bottom-4 z-40 flex justify-center px-4",
            className
          )}
        >
          <div
            role="region"
            aria-label="Selection actions"
            className="material-floating pointer-events-auto flex flex-wrap items-center gap-2 rounded-2xl px-3 py-2 [--glass-blur:22px]"
          >
            <p className="figures-tabular px-1 text-callout">
              <span className="font-semibold">{formatInteger(count)}</span>
              <span className="text-muted-foreground">
                {" "}
                selected
                {present.length === 1 ? ` · ${SOURCE_LABEL[present[0]]}` : ""}
              </span>
            </p>

            <span aria-hidden className="hairline-s h-5 self-center" />

            <Button variant="ghost" size="sm" onClick={onClear}>
              <X data-icon="inline-start" />
              Clear
            </Button>

            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger
                render={
                  <Button variant="destructive" size="sm">
                    <Trash2 data-icon="inline-start" />
                    Delete selected
                  </Button>
                }
              />

              <DialogPopup className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>
                    Delete {formatInteger(count)} transaction
                    {count === 1 ? "" : "s"}?
                  </DialogTitle>
                  <DialogDescription>
                    They are removed from the retention buffer and from Supabase
                    if it is connected. Nothing restores them.
                  </DialogDescription>
                </DialogHeader>

                <DialogBody className="grid gap-3">
                  <dl className="list-inset bg-inset [--list-inset:0.875rem]">
                    {present.map((source) => (
                      <div
                        key={source}
                        className="flex items-baseline justify-between gap-4 px-3.5 py-2"
                      >
                        <dt className="text-callout text-muted-foreground">
                          {SOURCE_LABEL[source]}
                        </dt>
                        <dd className="figures-tabular text-callout font-medium">
                          {formatInteger(breakdown[source])}
                        </dd>
                      </div>
                    ))}
                  </dl>

                  {ownCount > 0 ? (
                    <p className="text-callout text-[var(--severity-high)]">
                      {formatInteger(ownCount)} of these did not come from the
                      generator: they were uploaded or scored by hand. Clear the
                      selection and filter by origin if you only meant to remove
                      synthetic traffic.
                    </p>
                  ) : null}
                </DialogBody>

                <DialogFooter>
                  <DialogClose
                    render={
                      <Button variant="outline" size="sm" disabled={busy}>
                        Keep them
                      </Button>
                    }
                  />
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={confirm}
                    disabled={busy}
                  >
                    {busy
                      ? "Deleting…"
                      : `Delete ${formatInteger(count)} row${count === 1 ? "" : "s"}`}
                  </Button>
                </DialogFooter>
              </DialogPopup>
            </Dialog>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
