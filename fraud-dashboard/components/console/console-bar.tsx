"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { LoaderCircle, Menu, RefreshCw, Zap } from "lucide-react";
import {
  SignInButton,
  useAuth,
  UserButton,
} from "@clerk/nextjs";

import { formatRelative } from "@/lib/format";
import { useNow } from "@/lib/hooks";
import { describePoll, useConsoleSettings } from "@/lib/settings";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetDescription,
  SheetPopup,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Tooltip } from "@/components/ui/tooltip";
import { ThemeToggle } from "@/components/theme-toggle";
import { useConsole } from "@/components/console/console-provider";
import { activeItem } from "@/components/console/nav-config";
import { ConsoleMark, NavList, type NavCounts } from "@/components/console/side-nav";

/**
 * Connection is a state, so it wears a reserved status colour and ships with the
 * word beside it. A green-vs-red dot alone is exactly the failure the status
 * palette exists to prevent.
 */
function ConnectionPill({
  connected,
  lastSyncedAt,
  now,
  pollMs,
}: {
  connected: boolean;
  lastSyncedAt: number | null;
  now: number | null;
  pollMs: number;
}) {
  const synced =
    lastSyncedAt !== null && now !== null
      ? formatRelative(new Date(lastSyncedAt).toISOString(), now)
      : null;

  const label = connected ? (pollMs > 0 ? "Live" : "Held") : "Offline";

  return (
    <Tooltip
      content={
        connected
          ? pollMs > 0
            ? `Polling the scoring engine every ${describePoll(pollMs)}.`
            : "The heartbeat is paused. Refresh fetches on demand."
          : "The scoring engine is unreachable. The last successful snapshot is still on screen."
      }
      side="bottom"
    >
      <span
        className={cn(
          "inline-flex cursor-help items-center gap-2 rounded-full px-2.5 py-1 text-callout ring-1 ring-inset",
          connected
            ? "bg-[color-mix(in_oklab,var(--brand)_9%,transparent)] ring-[color-mix(in_oklab,var(--brand)_26%,transparent)]"
            : "bg-[color-mix(in_oklab,var(--severity-critical)_9%,transparent)] ring-[color-mix(in_oklab,var(--severity-critical)_28%,transparent)]"
        )}
      >
        <span
          aria-hidden
          className={cn(
            "size-1.5 shrink-0 rounded-full",
            connected && pollMs > 0 && "pulse-live"
          )}
          style={{
            background: connected ? "var(--brand)" : "var(--severity-critical)",
          }}
        />
        <span className="font-medium">{label}</span>
        {synced ? (
          <span className="figures-tabular hidden text-[var(--ink-muted)] sm:inline">
            {synced}
          </span>
        ) : null}
      </span>
    </Tooltip>
  );
}

/** The mobile presentation of the rail. Closes itself on navigation. */
function MobileNav({ counts }: { counts: NavCounts }) {
  const [open, setOpen] = React.useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Open the console navigation"
            className="lg:hidden"
          >
            <Menu className="size-4" />
          </Button>
        }
      />
      <SheetPopup className="gap-5 px-3 py-4">
        <div className="px-1.5">
          <ConsoleMark />
        </div>
        {/* Named for assistive technology without printing a second heading:
            the rail already reads as navigation on screen. */}
        <SheetTitle className="sr-only">Console navigation</SheetTitle>
        <SheetDescription className="sr-only">
          Move between the monitoring, analysis and tooling sections.
        </SheetDescription>
        <NavList counts={counts} onNavigate={() => setOpen(false)} />
        <SheetClose
          render={
            <Button variant="outline" size="sm" className="justify-center">
              Close
            </Button>
          }
        />
      </SheetPopup>
    </Sheet>
  );
}

/**
 * The console's one persistent bar: where you are on the left, the state of the
 * connection and the two actions that apply everywhere on the right.
 *
 * It keeps the glass material because this is one of only two surfaces in the
 * application with real content moving behind it.
 */
export function ConsoleBar({ counts }: { counts: NavCounts }) {
  const { isSignedIn } = useAuth();
  const { isConnected, isRefetching, lastSyncedAt, refresh, runSimulation } =
    useConsole();
  const { pollMs } = useConsoleSettings();
  const pathname = usePathname();
  const now = useNow(4_000);
  const [bursting, setBursting] = React.useState(false);

  const current = activeItem(pathname);

  const burst = () => {
    setBursting(true);
    void runSimulation(10).finally(() => setBursting(false));
  };

  return (
    <header className="material-chrome material-seam sticky top-0 z-30">
      <div className="flex h-14 items-center gap-3 px-4 sm:px-6">
        <MobileNav counts={counts} />

        {/* The bar carries the location, so the page below never has to repeat
            it in a breadcrumb. */}
        <div className="min-w-0">
          <p className="truncate text-title-3 font-semibold">
            {current?.label ?? "Console"}
          </p>
          {current?.blurb ? (
            <p className="hidden truncate text-subheadline text-muted-foreground md:block">
              {current.blurb}
            </p>
          ) : null}
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-2">
          <ConnectionPill
            connected={isConnected}
            lastSyncedAt={lastSyncedAt}
            now={now}
            pollMs={pollMs}
          />

          <Tooltip content="Inject 10 synthetic instructions" side="bottom">
            <Button
              variant="outline"
              size="sm"
              onClick={burst}
              disabled={bursting}
              className="hidden sm:inline-flex"
            >
              {bursting ? (
                <LoaderCircle
                  data-icon="inline-start"
                  className="animate-spin motion-reduce:animate-none"
                />
              ) : (
                <Zap data-icon="inline-start" />
              )}
              Simulate
            </Button>
          </Tooltip>

          <Tooltip content="Re-read the whole buffer now" side="bottom">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={refresh}
              disabled={isRefetching}
              aria-label="Refresh the buffer"
            >
              <RefreshCw
                className={cn(
                  "size-4",
                  isRefetching && "animate-spin motion-reduce:animate-none"
                )}
              />
            </Button>
          </Tooltip>

          <ThemeToggle />

          {/* ===== Clerk Authentication ===== */}
          {!isSignedIn ? (
            <SignInButton mode="modal">
              <Button variant="outline" size="sm">
                Sign In
              </Button>
            </SignInButton>
          ) : null}

          {isSignedIn ? (
            <UserButton />
          ) : null}
        </div>
      </div>
    </header>
  );
}